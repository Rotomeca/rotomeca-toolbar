const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { t, getLocale, getDictionary } = require('../dist/src/scripts/i18n.js');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const readLocale = (name) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${name}.json`), 'utf8'));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('getLocale : hors Electron, la langue par défaut (anglais)', () => {
  assert.equal(getLocale(), 'en');
});

test('getDictionary : contient les textes de la langue courante', () => {
  const dictionary = getDictionary();
  assert.equal(dictionary['permission.allow'], readLocale('en')['permission.allow']);
  assert.ok(Object.keys(dictionary).length > 100);
});

test('t : renvoie la clé quand elle est inconnue', () => {
  assert.equal(t('cette.clef.nexiste.pas'), 'cette.clef.nexiste.pas');
});

test('t : remplace les {variables}, nombres compris', () => {
  assert.equal(t('permission.message', { origin: 'https://x.test', action: 'faire' }), 'https://x.test wants to faire.');
  assert.equal(t('update.card.lastMinutes', { n: 5 }), 'last 5 min ago');
});

test('t : laisse un {nom} sans valeur tel quel', () => {
  assert.equal(t('permission.message', { origin: 'https://x.test' }), 'https://x.test wants to {action}.');
  assert.equal(t('permission.message'), '{origin} wants to {action}.');
});

test('t : une variable héritée de Object (constructor...) n\'est pas substituée', () => {
  // Une clé inconnue est renvoyée telle quelle : elle passe quand même par l'interpolation.
  // `{constructor}` ne doit jamais afficher le code d'une fonction.
  assert.equal(t('a {constructor} b {toString}'), 'a {constructor} b {toString}');
  assert.equal(t('a {constructor} b', { constructor: 'ok' }), 'a ok b');
});

test('langues : le français et l\'anglais ont exactement les mêmes clés', () => {
  const fr = Object.keys(readLocale('fr')).sort();
  const en = Object.keys(readLocale('en')).sort();
  assert.deepEqual(fr, en);
});

test('langues : chaque texte a les mêmes {variables} en français et en anglais', () => {
  const fr = readLocale('fr');
  const en = readLocale('en');
  for (const key of Object.keys(en)) {
    assert.deepEqual(placeholders(fr[key]), placeholders(en[key]), key);
  }
});

test('langues : aucun texte vide ni non textuel', () => {
  for (const name of ['fr', 'en']) {
    for (const [key, value] of Object.entries(readLocale(name))) {
      assert.equal(typeof value, 'string', `${name}:${key}`);
      assert.notEqual(value.trim(), '', `${name}:${key}`);
    }
  }
});
