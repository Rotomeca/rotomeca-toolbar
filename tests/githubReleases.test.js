const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readRelease,
  fetchLatestRelease,
  fetchRecentReleases,
  findNewestPrerelease,
  GithubResponseError,
} = require('../dist/src/scripts/githubReleases.js');
const { compareVersions } = require('../dist/src/scripts/versions.js');

const REPO = 'Rotomeca/releases';

const release = (tag, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
  prerelease: false,
  draft: false,
  ...extra,
});

/** Faux `fetch` qui répond avec un corps JSON et mémorise la dernière requête. */
function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const fetch = async (url, init) => {
    fetch.lastUrl = url;
    fetch.lastInit = init;
    return { ok, status, json: async () => body };
  };
  return fetch;
}

test('readRelease : lit la version (sans « v ») et la page du dépôt', () => {
  assert.deepEqual(readRelease(release('v3.4.0'), REPO), {
    version: '3.4.0',
    page: `https://github.com/${REPO}/releases/tag/v3.4.0`,
  });
});

test('readRelease : refuse une pré-version sauf avec allowPre', () => {
  assert.throws(() => readRelease(release('3.4.0-rc1'), REPO), GithubResponseError);
  assert.equal(readRelease(release('3.4.0-rc1'), REPO, { allowPre: true }).version, '3.4.0-rc1');
});

test('readRelease : refuse les suffixes autres que -rcN, même avec allowPre', () => {
  for (const tag of ['3.4.0-beta1', '3.4.0-rc', '3.4.0-rc1-evil', 'latest', '3.4.0; rm -rf']) {
    assert.throws(() => readRelease(release(tag), REPO, { allowPre: true }), GithubResponseError, tag);
  }
});

test('readRelease : refuse une page hors du dépôt', () => {
  for (const html_url of [
    'https://evil.example/releases/3.4.0',
    'https://github.com/Autre/depot/releases/3.4.0',
    `http://github.com/${REPO}/releases/3.4.0`,
    '',
  ]) {
    assert.throws(() => readRelease(release('3.4.0', { html_url }), REPO), GithubResponseError, html_url);
  }
});

test('readRelease : refuse tout ce qui n\'est pas un objet de release', () => {
  for (const value of [null, undefined, 'texte', 42, [], {}]) {
    assert.throws(() => readRelease(value, REPO), GithubResponseError, String(value));
  }
});

test('fetchLatestRelease : interroge releases/latest du dépôt avec les bons en-têtes', async () => {
  const fetch = fakeFetch(release('3.4.0'));
  const latest = await fetchLatestRelease(fetch, REPO);

  assert.equal(latest.version, '3.4.0');
  assert.equal(fetch.lastUrl, `https://api.github.com/repos/${REPO}/releases/latest`);
  assert.deepEqual(fetch.lastInit, { headers: { Accept: 'application/vnd.github+json' } });
});

test('fetchLatestRelease : une réponse en erreur lève une erreur typée avec le code HTTP', async () => {
  await assert.rejects(fetchLatestRelease(fakeFetch({}, { ok: false, status: 403 }), REPO), (error) => {
    assert.ok(error instanceof GithubResponseError);
    assert.match(error.message, /403/);
    return true;
  });
});

test('fetchLatestRelease : une pré-version renvoyée comme dernière release est refusée', async () => {
  await assert.rejects(fetchLatestRelease(fakeFetch(release('3.4.0-rc1')), REPO), GithubResponseError);
});

test('fetchRecentReleases : renvoie la liste et demande 30 releases', async () => {
  const fetch = fakeFetch([release('3.4.0'), release('3.3.0')]);

  assert.equal((await fetchRecentReleases(fetch, REPO)).length, 2);
  assert.equal(fetch.lastUrl, `https://api.github.com/repos/${REPO}/releases?per_page=30`);
});

test('fetchRecentReleases : refuse une réponse qui n\'est pas une liste', async () => {
  await assert.rejects(fetchRecentReleases(fakeFetch({ message: 'nope' }), REPO), GithubResponseError);
  await assert.rejects(fetchRecentReleases(fakeFetch({}, { ok: false, status: 500 }), REPO), GithubResponseError);
});

const newest = (releases, current = '3.3.0') => findNewestPrerelease(releases, REPO, current, compareVersions);

test('findNewestPrerelease : retient la plus récente, par numéro de version', () => {
  const found = newest([
    release('3.4.0-rc2', { prerelease: true }),
    release('3.4.0-rc10', { prerelease: true }),
    release('3.4.0-rc9', { prerelease: true }),
  ]);
  assert.equal(found.version, '3.4.0-rc10');
});

test('findNewestPrerelease : ignore versions publiées, brouillons et versions non récentes', () => {
  assert.equal(
    newest([
      release('3.9.0'),
      release('3.8.0', { prerelease: true, draft: true }),
      release('3.3.0', { prerelease: true }),
      release('3.2.0', { prerelease: true }),
    ]),
    null,
  );
});

test('findNewestPrerelease : un format inattendu ou une valeur invalide ne bloque pas les autres', () => {
  const found = newest([
    null,
    'texte',
    42,
    release('latest', { prerelease: true }),
    release('3.5.0', { prerelease: true, html_url: 'https://evil.example/x' }),
    release('3.4.0-rc1', { prerelease: true }),
  ]);
  assert.equal(found.version, '3.4.0-rc1');
});

test('findNewestPrerelease : depuis un rc installé, seul un rc plus récent compte', () => {
  const releases = [release('3.4.0-rc1', { prerelease: true }), release('3.4.0-rc2', { prerelease: true })];
  assert.equal(newest(releases, '3.4.0-rc1').version, '3.4.0-rc2');
  assert.equal(newest(releases, '3.4.0-rc2'), null);
});

test('findNewestPrerelease : aucune release, aucun résultat', () => {
  assert.equal(newest([]), null);
});
