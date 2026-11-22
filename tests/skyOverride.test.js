const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeSkyOverride } = require('../dist/src/main/theming/skyOverride.js');

test('sanitizeSkyOverride : garde les valeurs de la liste blanche', () => {
  assert.deepEqual(sanitizeSkyOverride({ season: 'ete', moment: 'nuit', weather: 'pluie' }), { season: 'ete', moment: 'nuit', weather: 'pluie' });
  assert.deepEqual(sanitizeSkyOverride({ moment: 'aube' }), { season: null, moment: 'aube', weather: null });
});

test('sanitizeSkyOverride : une valeur inconnue redevient automatique', () => {
  assert.deepEqual(sanitizeSkyOverride({ season: '<script>', moment: 'minuit', weather: 'neige' }), null);
  assert.deepEqual(sanitizeSkyOverride({ season: 'sombre', moment: 'jour' }), { season: null, moment: 'jour', weather: null });
});

test('sanitizeSkyOverride : rien de forcé ou donnée invalide donne null', () => {
  for (const raw of [null, undefined, 'texte', 12, {}, { season: '', moment: '', weather: '' }]) {
    assert.equal(sanitizeSkyOverride(raw), null);
  }
});
