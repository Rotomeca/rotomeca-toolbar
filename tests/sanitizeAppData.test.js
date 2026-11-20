const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeAppData } = require('../dist/src/main/security/sanitizeAppData.js');

const valid = { name: 'Mon app', url: 'https://example.com/app', picture: 'data:image/png;base64,AAAA' };

test('sanitizeAppData : des données valides sont conservées', () => {
  assert.deepEqual(sanitizeAppData(valid), valid);
});

test('sanitizeAppData : seules l\'URL http(s) valides sont acceptées', () => {
  for (const url of ['https://x.test', 'http://x.test/a?b=1#c']) {
    assert.equal(sanitizeAppData({ ...valid, url }).url, url);
  }
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/Windows/System32/cmd.exe',
    'data:text/html,<script>',
    'ftp://x.test',
    'x.test',
    '',
    42,
    null,
    undefined,
    {},
  ]) {
    assert.equal(sanitizeAppData({ ...valid, url }), null, String(url));
  }
});

test('sanitizeAppData : ce qui n\'est pas un objet est refusé', () => {
  for (const data of [null, undefined, 'texte', 42, true]) {
    assert.equal(sanitizeAppData(data), null, String(data));
  }
});

test('sanitizeAppData : sans nom exploitable, le nom est l\'URL', () => {
  for (const name of [undefined, null, '', '   ', 42, {}]) {
    assert.equal(sanitizeAppData({ url: valid.url, name }).name, valid.url, String(name));
  }
});

test('sanitizeAppData : le nom est tronqué à 200 caractères', () => {
  assert.equal(sanitizeAppData({ ...valid, name: 'x'.repeat(500) }).name.length, 200);
});

test('sanitizeAppData : une image intégrée d\'un type sûr est acceptée', () => {
  for (const type of ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg+xml', 'x-icon', 'vnd.microsoft.icon', 'bmp']) {
    const picture = `data:image/${type};base64,AAAA`;
    assert.equal(sanitizeAppData({ ...valid, picture }).picture, picture, type);
  }
});

test('sanitizeAppData : une icône de police est acceptée', () => {
  assert.equal(sanitizeAppData({ ...valid, picture: 'font:material-home' }).picture, 'font:material-home');
});

test('sanitizeAppData : une image dangereuse, trop grande ou mal formée devient null', () => {
  for (const picture of [
    'http://x.test/a.png',
    'https://x.test/a.png',
    'javascript:alert(1)',
    'data:text/html;base64,AAAA',
    'data:image/tiff;base64,AAAA',
    'data:image/png,sans-base64-ni-point-virgule',
    `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`,
    'font:espace interdit',
    `font:${'x'.repeat(65)}`,
    'font:',
    '',
    42,
    null,
    {},
  ]) {
    assert.equal(sanitizeAppData({ ...valid, picture }).picture, null, String(picture).slice(0, 40));
  }
});

test('sanitizeAppData : sans image, picture vaut null', () => {
  assert.equal(sanitizeAppData({ url: valid.url, name: 'x' }).picture, null);
});

test('sanitizeAppData : ne renvoie que les trois champs connus', () => {
  const clean = sanitizeAppData({ ...valid, admin: true, __proto__: { polluted: true }, onclick: 'x' });
  assert.deepEqual(Object.keys(clean).sort(), ['name', 'picture', 'url']);
});
