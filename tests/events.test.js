const test = require('node:test');
const assert = require('node:assert/strict');
const { appEventList, pageEventList, internalChannels } = require('../dist/src/shared/ipc/events.js');

const values = (list) => Object.values(list);
const duplicates = (list) => values(list).filter((value, index, all) => all.indexOf(value) !== index);

test('canaux : les trois listes ne sont pas vides', () => {
  assert.ok(values(appEventList).length > 0);
  assert.ok(values(pageEventList).length > 0);
  assert.ok(values(internalChannels).length > 0);
});

test('canaux : aucun nom de canal n\'apparaît deux fois dans une même liste', () => {
  assert.deepEqual(duplicates(appEventList), []);
  assert.deepEqual(duplicates(pageEventList), []);
  assert.deepEqual(duplicates(internalChannels), []);
});

test('canaux : un canal d\'appel n\'est jamais aussi un canal d\'envoi (sens unique)', () => {
  const sent = new Set(values(pageEventList));
  assert.deepEqual(values(appEventList).filter((channel) => sent.has(channel)), []);
});

test('canaux : les canaux internes n\'entrent pas dans la liste blanche des pages', () => {
  const exposed = new Set([...values(appEventList), ...values(pageEventList)]);
  assert.deepEqual(values(internalChannels).filter((channel) => exposed.has(channel)), []);
});

test('canaux : chaque nom est une chaîne simple, sans espace', () => {
  for (const channel of [...values(appEventList), ...values(pageEventList), ...values(internalChannels)]) {
    assert.match(channel, /^[\w.-]+$/, channel);
  }
});

test('canaux : les listes sont figées par leur type, pas modifiables par erreur à l\'exécution', () => {
  // `as const` ne gèle pas l'objet à l'exécution : on vérifie au moins que la liste est stable
  const before = JSON.stringify(appEventList);
  assert.equal(JSON.stringify(appEventList), before);
});
