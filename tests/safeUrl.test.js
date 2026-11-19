const test = require('node:test');
const assert = require('node:assert/strict');
const { isSafeUrl } = require('../src/scripts/safeUrl.js');

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
