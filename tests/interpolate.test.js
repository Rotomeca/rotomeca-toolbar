const test = require('node:test');
const assert = require('node:assert/strict');
const { interpolate } = require('../dist/src/shared/i18n/interpolate.js');

test('interpolate : remplace chaque {variable}, texte et nombre', () => {
  assert.equal(interpolate('Bonjour {nom}, {n} message(s)', { nom: 'Ana', n: 3 }), 'Bonjour Ana, 3 message(s)');
});

test('interpolate : une variable répétée est remplacée partout', () => {
  assert.equal(interpolate('{a} et {a}', { a: 'x' }), 'x et x');
});

test('interpolate : un {nom} sans valeur reste visible', () => {
  assert.equal(interpolate('Bonjour {nom}'), 'Bonjour {nom}');
  assert.equal(interpolate('Bonjour {nom}', {}), 'Bonjour {nom}');
  assert.equal(interpolate('{a} {b}', { a: 'x' }), 'x {b}');
});

test('interpolate : la valeur 0 ou la chaîne vide sont de vraies valeurs', () => {
  assert.equal(interpolate('{n} élément(s)', { n: 0 }), '0 élément(s)');
  assert.equal(interpolate('[{v}]', { v: '' }), '[]');
});

test('interpolate : les propriétés héritées de Object ne sont jamais substituées', () => {
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(interpolate(`a {${name}} b`), `a {${name}} b`, name);
  }
  assert.equal(interpolate('a {constructor} b', { constructor: 'ok' }), 'a ok b');
});

test('interpolate : ne touche pas à ce qui n\'est pas un {mot}', () => {
  for (const text of ['{ espace }', '{}', '{a-b}', '}{', 'sans variable']) {
    assert.equal(interpolate(text, { espace: 'x', 'a-b': 'y' }), text, text);
  }
});

test('interpolate : une valeur qui contient {autre} n\'est pas réinterprétée', () => {
  assert.equal(interpolate('{a}', { a: '{b}', b: 'piège' }), '{b}');
});
