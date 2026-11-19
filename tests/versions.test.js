const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions } = require('../src/scripts/versions.js');

test('compareVersions : plus récente / plus ancienne / égale', () => {
  assert.ok(compareVersions('3.2.1', '3.2.0') > 0);
  assert.ok(compareVersions('3.2.0', '3.2.1') < 0);
  assert.equal(compareVersions('3.2.0', '3.2.0'), 0);
});

test('compareVersions : compare numériquement, pas alphabétiquement', () => {
  assert.ok(compareVersions('3.10.0', '3.9.0') > 0);
  assert.ok(compareVersions('10.0.0', '9.9.9') > 0);
});

test('compareVersions : ignore le préfixe v et les segments manquants', () => {
  assert.equal(compareVersions('v3.2.0', '3.2.0'), 0);
  assert.equal(compareVersions('3.2', '3.2.0'), 0);
  assert.ok(compareVersions('3.2.1', '3.2') > 0);
});

test('compareVersions : une valeur invalide ne lève pas', () => {
  assert.doesNotThrow(() => compareVersions('abc', '1.0.0'));
  assert.ok(compareVersions('abc', '1.0.0') < 0);
  assert.doesNotThrow(() => compareVersions(undefined, null));
});
