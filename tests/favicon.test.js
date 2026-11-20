const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIconLinks, findFavicon } = require('../dist/src/main/apps/favicon.js');
const { FaviconService, FOUND_TTL_MS, MISSING_TTL_MS } = require('../dist/src/main/apps/FaviconService.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const ICO = Buffer.from([0, 0, 1, 0, 1, 0]);

/** Réponse factice : un corps (texte ou octets) et un type. */
function reply(body, type, ok = true) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    ok,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    text: async () => bytes.toString(),
  };
}

/** Faux réseau : une table adresse → réponse ; le reste répond 404. */
function network(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route instanceof Error) throw route;
    return route ?? reply('', 'text/html', false);
  };
  return { fetch, calls };
}

test('parseIconLinks : relatif résolu, plus grande taille d\'abord, rel inconnu et mask-icon ignorés', () => {
  const html = `<head>
    <link rel="icon" href="/small.png" sizes="16x16">
    <link rel='shortcut icon' href='big.png' sizes="32x32 180x180">
    <link rel="mask-icon" href="/mask.svg">
    <link rel="stylesheet" href="/style.css">
    <link rel="apple-touch-icon" href="https://cdn.example.com/a.png?x=1&amp;y=2">
  </head>`;

  assert.deepEqual(parseIconLinks(html, 'https://example.com/app/index.html'), [
    { url: 'https://example.com/app/big.png', size: 180 },
    { url: 'https://cdn.example.com/a.png?x=1&y=2', size: 0 },
    { url: 'https://example.com/small.png', size: 16 },
  ]);
});

test('parseIconLinks : refuse javascript:, data: et le réseau local depuis une page publique', () => {
  const html = `<link rel="icon" href="javascript:alert(1)"><link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="icon" href="http://192.168.1.1/x.png"><link rel="icon" href="http://localhost:8080/x.png">`;

  assert.deepEqual(parseIconLinks(html, 'https://example.com/'), []);
  assert.equal(parseIconLinks(html, 'http://192.168.1.5/').length, 2);
});

test('findFavicon : prend l\'icône déclarée par la page, en data:', async () => {
  const { fetch } = network({
    'https://example.com/': reply('<link rel="icon" href="/logo.png" sizes="64x64">', 'text/html; charset=utf-8'),
    'https://example.com/logo.png': reply(PNG, 'image/png'),
  });

  assert.equal(await findFavicon('https://example.com/', fetch), `data:image/png;base64,${PNG.toString('base64')}`);
});

test('findFavicon : repli sur /favicon.ico quand la page ne déclare rien ou ne répond pas', async () => {
  const { fetch } = network({
    'https://example.com/': new Error('réseau'),
    'https://example.com/favicon.ico': reply(ICO, 'image/x-icon'),
  });

  assert.equal(await findFavicon('https://example.com/', fetch), `data:image/x-icon;base64,${ICO.toString('base64')}`);
});

test('findFavicon : une réponse qui n\'est pas une image (page d\'erreur en 200) est refusée', async () => {
  const { fetch } = network({
    'https://example.com/': reply('<html></html>', 'text/html'),
    'https://example.com/favicon.ico': reply('<html>pas là</html>', 'text/html'),
    'https://example.com/apple-touch-icon.png': reply(Buffer.alloc(200 * 1024, 1), 'image/png'),
  });

  assert.equal(await findFavicon('https://example.com/', fetch), null);
});

test('findFavicon : une icône déclarée en erreur passe à la suivante, une adresse non http(s) est refusée', async () => {
  const { fetch, calls } = network({
    'https://example.com/': reply('<link rel="icon" href="/a.png" sizes="128x128"><link rel="icon" href="/b.png">', 'text/html'),
    'https://example.com/a.png': new Error('délai'),
    'https://example.com/b.png': reply(PNG, 'image/png'),
  });

  assert.match(await findFavicon('https://example.com/', fetch), /^data:image\/png/);
  assert.deepEqual(calls.slice(0, 3), ['https://example.com/', 'https://example.com/a.png', 'https://example.com/b.png']);
  assert.equal(await findFavicon('file:///etc/passwd', fetch), null);
});

/** Service avec un faux dépôt et une horloge réglable. */
function service(routes, saved = false) {
  const net = network(routes);
  const writes = [];
  const clock = { now: 1_000 };
  const svc = new FaviconService({
    fetch: net.fetch,
    repository: { loadAsync: async () => saved, save: (data) => writes.push(data) },
    now: () => clock.now,
  });
  return { svc, net, writes, clock };
}

const SITE = { 'https://example.com/': reply('<link rel="icon" href="/l.png">', 'text/html'), 'https://example.com/l.png': reply(PNG, 'image/png') };

test('FaviconService : une seule recherche pour plusieurs demandes du même site, résultat gardé et enregistré', async () => {
  const { svc, net, writes } = service(SITE);

  const [a, b] = await Promise.all([svc.resolve('https://example.com/'), svc.resolve('https://example.com/')]);
  assert.equal(a, b);
  assert.match(a, /^data:image\/png/);

  const before = net.calls.length;
  await svc.resolve('https://example.com/c');
  assert.equal(net.calls.length, before, 'servi par le cache');
  assert.equal(writes.length, 1);
});

test('FaviconService : l\'absence d\'icône est retenue 6 h, une icône trouvée plus longtemps', async () => {
  const missing = service({});
  assert.equal(await missing.svc.resolve('https://none.example/'), null);
  const calls = missing.net.calls.length;

  missing.clock.now += MISSING_TTL_MS - 1;
  await missing.svc.resolve('https://none.example/');
  assert.equal(missing.net.calls.length, calls);
  missing.clock.now += 2;
  await missing.svc.resolve('https://none.example/');
  assert.ok(missing.net.calls.length > calls, 'nouvelle recherche après le délai');

  const found = service(SITE);
  await found.svc.resolve('https://example.com/');
  const foundCalls = found.net.calls.length;
  found.clock.now += MISSING_TTL_MS + 1;
  await found.svc.resolve('https://example.com/');
  assert.equal(found.net.calls.length, foundCalls);
  found.clock.now += FOUND_TTL_MS;
  await found.svc.resolve('https://example.com/');
  assert.ok(found.net.calls.length > foundCalls);
});

test('FaviconService : relit le cache enregistré et ignore ce qui est mal formé', async () => {
  const icon = `data:image/png;base64,${PNG.toString('base64')}`;
  const { svc, net } = service({}, {
    'https://example.com': { icon, at: 1_000 },
    'https://bad.example': { icon: 'javascript:alert(1)', at: 1_000 },
    'https://worse.example': 42,
  });

  assert.equal(await svc.resolve('https://example.com/x'), icon);
  assert.equal(net.calls.length, 0);
  assert.equal(await svc.resolve('https://bad.example/'), null);
  assert.ok(net.calls.length > 0, 'l\'entrée invalide est refaite');
});

test('FaviconService : une adresse invalide donne null sans réseau', async () => {
  const { svc, net } = service(SITE);

  assert.equal(await svc.resolve('pas une adresse'), null);
  assert.equal(await svc.resolve('data:text/html,x'), null);
  assert.equal(net.calls.length, 0);
});

test('findFavicon : les icônes du site passent avant /favicon.ico, celles d\'un autre site en dernier', async () => {
  const { fetch, calls } = network({
    'https://music.example.com/': reply(
      '<link rel="icon" href="https://www.google.com/favicon.ico"><link rel="icon" href="https://static.example.com/m.png" sizes="64x64">',
      'text/html',
    ),
    'https://static.example.com/m.png': new Error('indisponible'),
    'https://music.example.com/favicon.ico': reply(ICO, 'image/x-icon'),
    'https://www.google.com/favicon.ico': reply(PNG, 'image/png'),
  });

  assert.match(await findFavicon('https://music.example.com/', fetch), /^data:image\/x-icon/);
  assert.deepEqual(calls, [
    'https://music.example.com/',
    'https://static.example.com/m.png',
    'https://music.example.com/favicon.ico',
  ]);
});

test('findFavicon : ne lit que le début d\'une page volumineuse, jusqu\'à la fin du <head>', async () => {
  const chunks = ['<html><head><link rel="icon" href="/logo.png">', '</head><body>', 'x'.repeat(1000), 'y'.repeat(1000)];
  let read = 0;
  let cancelled = false;
  const page = {
    ...reply('', 'text/html'),
    text: async () => {
      throw new Error('toute la page ne doit pas être lue');
    },
    body: {
      getReader: () => ({
        read: async () => (read < chunks.length ? { done: false, value: new TextEncoder().encode(chunks[read++]) } : { done: true }),
        cancel: async () => {
          cancelled = true;
        },
      }),
    },
  };
  const { fetch } = network({ 'https://big.example/': page, 'https://big.example/logo.png': reply(PNG, 'image/png') });

  assert.match(await findFavicon('https://big.example/', fetch), /^data:image\/png/);
  assert.equal(read, 2, 'arrêt dès </head>');
  assert.equal(cancelled, true);
});

test('FaviconService : un site injoignable n\'est pas mémorisé, la demande suivante réessaie', async () => {
  const down = service({ 'https://icons.duckduckgo.com/ip3/down.example.ico': new Error('délai'), 'https://down.example/': new Error('délai'), 'https://down.example/favicon.ico': new Error('délai'), 'https://down.example/apple-touch-icon.png': new Error('délai') });

  assert.equal(await down.svc.resolve('https://down.example/'), null);
  assert.equal(down.writes.length, 0, 'rien enregistré');
  const calls = down.net.calls.length;

  await down.svc.resolve('https://down.example/');
  assert.ok(down.net.calls.length > calls, 'nouvelle recherche');
});

test('findFavicon : lève FaviconNetworkError seulement si le site ne répond à aucune requête', async () => {
  const { FaviconNetworkError } = require('../dist/src/main/apps/favicon.js');
  const { fetch } = network({ 'https://x.example/': new Error('a'), 'https://x.example/favicon.ico': new Error('b'), 'https://x.example/apple-touch-icon.png': new Error('c') });

  await assert.rejects(() => findFavicon('https://x.example/', fetch), FaviconNetworkError);
  // Une réponse 404 prouve que le site est joignable : pas d'icône, sans erreur
  assert.equal(await findFavicon('https://y.example/', network({}).fetch), null);
});

test('findFavicon (fast) : /favicon.ico du site répond seul, ni service ni page', async () => {
  const { fetch, calls } = network({ 'https://app.example.com/favicon.ico': reply(ICO, 'image/x-icon') });

  assert.match(await findFavicon('https://app.example.com/inbox', fetch, { fast: true }), /^data:image\/x-icon/);
  assert.deepEqual(calls, ['https://app.example.com/favicon.ico']);
});

test('findFavicon (fast) : sans /favicon.ico, le service d\'icônes répond seul', async () => {
  const { fetch, calls } = network({ 'https://icons.duckduckgo.com/ip3/app.example.com.ico': reply(PNG, 'image/png') });

  assert.match(await findFavicon('https://app.example.com/', fetch, { fast: true }), /^data:image\/png/);
  assert.deepEqual(calls, ['https://app.example.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/app.example.com.ico']);
});

test('findFavicon (fast) : ni /favicon.ico ni service (404 ou panne) → lecture de la page, sans refaire /favicon.ico', async () => {
  const site = { 'https://app.example.com/': reply('<link rel="icon" href="/l.png">', 'text/html'), 'https://app.example.com/l.png': reply(PNG, 'image/png') };

  for (const serviceRoute of [undefined, new Error('panne')]) {
    const { fetch, calls } = network({ ...site, 'https://icons.duckduckgo.com/ip3/app.example.com.ico': serviceRoute });
    assert.match(await findFavicon('https://app.example.com/', fetch, { fast: true }), /^data:image\/png/);
    assert.deepEqual(calls.slice(0, 3), ['https://app.example.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/app.example.com.ico', 'https://app.example.com/']);
    assert.equal(calls.filter((call) => call.endsWith('/favicon.ico')).length, 1);
  }
});

test('findFavicon (fast) : aucun nom privé, local ou IP n\'est transmis au service', async () => {
  for (const url of ['http://intranet/', 'http://wiki.local/', 'http://localhost:3000/', 'http://192.168.1.10/', 'http://8.8.8.8/', 'http://10.0.0.5:8080/']) {
    const { fetch, calls } = network({});
    await findFavicon(url, fetch, { fast: true });
    assert.ok(calls.every((call) => !call.includes('duckduckgo')), url);
  }
});
