const test = require('node:test');
const assert = require('node:assert/strict');
const { isSafeUrl, isPlainWebUrl, toSafeHref } = require('../dist/src/scripts/safeUrl.js');

test('isSafeUrl : accepte http et https', () => {
  assert.equal(isSafeUrl('https://example.com/path?q=1'), true);
  assert.equal(isSafeUrl('http://localhost:3000'), true);
});

test('isSafeUrl : refuse les autres protocoles', () => {
  for (const url of [
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com',
    'chrome://settings',
  ]) {
    assert.equal(isSafeUrl(url), false, url);
  }
});

test('isSafeUrl : refuse ce qui n\'est pas une URL', () => {
  for (const value of ['', 'example.com', 'not a url', null, undefined, 42, {}]) {
    assert.equal(isSafeUrl(value), false, String(value));
  }
});

test('isPlainWebUrl : accepte une URL http(s) sans espace ni identifiants', () => {
  for (const url of ['https://example.com', 'http://localhost:3000/a?b=1#c', 'HTTPS://EXAMPLE.COM/']) {
    assert.equal(isPlainWebUrl(url), true, url);
  }
});

test('isPlainWebUrl : refuse espaces, caractères de contrôle et identifiants (hôte trompeur)', () => {
  for (const url of [
    ' https://example.com',
    'https://example.com ',
    'https://exa mple.com',
    'https://example.com/\n',
    'https://example.com/\t',
    'https://google.com@evil.example',
    'https://user:pass@example.com',
    'javascript:alert(1)',
    'file:///C:/secret',
  ]) {
    assert.equal(isPlainWebUrl(url), false, JSON.stringify(url));
  }
  for (const value of [null, undefined, 42, {}]) assert.equal(isPlainWebUrl(value), false, String(value));
});

test('toSafeHref : renvoie la forme normalisée d\'une URL http(s), null sinon', () => {
  assert.equal(toSafeHref('HTTPS://Example.COM'), 'https://example.com/');
  assert.equal(toSafeHref('https://example.com/a b'), 'https://example.com/a%20b');
  for (const value of ['javascript:alert(1)', 'file:///x', '', null, 42]) assert.equal(toSafeHref(value), null, String(value));
});
