const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, isPrerelease } = require('../src/scripts/versions.js');

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

test('compareVersions : une pré-version est plus ancienne que sa version finale', () => {
  assert.ok(compareVersions('3.3.0-rc1', '3.3.0') < 0);
  assert.ok(compareVersions('3.3.0', '3.3.0-rc1') > 0);
  assert.ok(compareVersions('3.3.0-rc1', '3.3.0-rc2') < 0);
});

test('compareVersions : les rc se comparent par numéro, pas par texte', () => {
  assert.ok(compareVersions('3.3.0-rc10', '3.3.0-rc2') > 0);
});

test('compareVersions : une pré-version est plus récente que la version précédente', () => {
  assert.ok(compareVersions('3.3.0-rc1', '3.2.0') > 0);
  assert.ok(compareVersions('3.2.0', '3.3.0-rc1') < 0);
  assert.ok(compareVersions('3.10.0-rc1', '3.9.9') > 0);
});

test('compareVersions : égalité et préfixe v avec une pré-version', () => {
  assert.equal(compareVersions('3.3.0-rc1', '3.3.0-rc1'), 0);
  assert.equal(compareVersions('v3.3.0-rc1', '3.3.0-rc1'), 0);
});

test('compareVersions : un suffixe inconnu ne lève pas', () => {
  assert.doesNotThrow(() => compareVersions('3.3.0-', '3.3.0-beta'));
  assert.doesNotThrow(() => compareVersions('3.3.0-@@', '3.3.0'));
});

test('isPrerelease : reconnaît les pré-versions X.Y.Z-rcN', () => {
  assert.equal(isPrerelease('3.4.0-rc1'), true);
  assert.equal(isPrerelease('v3.4.0-rc12'), true);
  assert.equal(isPrerelease('3.4.0-beta2'), true);
});

test('isPrerelease : faux pour une release ou une valeur invalide', () => {
  assert.equal(isPrerelease('3.4.0'), false);
  assert.equal(isPrerelease('v3.4'), false);
  assert.equal(isPrerelease(undefined), false);
  assert.equal(isPrerelease(''), false);
});
