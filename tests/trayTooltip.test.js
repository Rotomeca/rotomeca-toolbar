const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrayTooltip } = require('../dist/src/main/tray/trayTooltip.js');

const translate = (key, variables = {}) => {
  const values = Object.entries(variables).map(([name, value]) => `${name}=${value}`).join(',');
  return values ? `${key}(${values})` : key;
};

const update = (overrides) => ({
  prerelease: false,
  versionActuelle: '3.4.1',
  versionDisponible: null,
  level: null,
  ...overrides,
});

test('buildTrayTooltip : sans gestionnaire de mises à jour, le texte de base seul', () => {
  assert.equal(buildTrayTooltip({ text: 'Barre', update: null, translate }), 'Barre');
});

test('buildTrayTooltip : à jour et version normale, le texte de base seul', () => {
  assert.equal(buildTrayTooltip({ text: 'Barre', update: update({}), translate }), 'Barre');
});

test('buildTrayTooltip : une pré-version l\'indique avec son numéro', () => {
  assert.equal(
    buildTrayTooltip({ text: 'Barre', update: update({ prerelease: true, versionActuelle: '3.5.0-rc1' }), translate }),
    'Barre\ntray.prerelease(version=3.5.0-rc1)',
  );
});

test('buildTrayTooltip : une mise à jour disponible donne sa version', () => {
  assert.equal(
    buildTrayTooltip({ text: 'Barre', update: update({ level: 'pending', versionDisponible: '3.5.0' }), translate }),
    'Barre\ntray.updateAvailable(version=3.5.0)',
  );
});

test('buildTrayTooltip : une mise à jour prête invite à redémarrer', () => {
  assert.equal(
    buildTrayTooltip({ text: 'Barre', update: update({ level: 'ready', versionDisponible: '3.5.0' }), translate }),
    'Barre\ntray.updateReady(version=3.5.0)',
  );
});

test('buildTrayTooltip : une version disponible inconnue donne une valeur vide', () => {
  assert.match(buildTrayTooltip({ text: 'Barre', update: update({ level: 'pending' }), translate }), /version=\)/);
});

test('buildTrayTooltip : pré-version et mise à jour, dans cet ordre', () => {
  const lines = buildTrayTooltip({
    text: 'Barre',
    update: update({ prerelease: true, versionActuelle: '3.5.0-rc1', level: 'ready', versionDisponible: '3.5.0' }),
    translate,
  }).split('\n');
  assert.deepEqual(lines, ['Barre', 'tray.prerelease(version=3.5.0-rc1)', 'tray.updateReady(version=3.5.0)']);
});

test('buildTrayTooltip : un texte de base sur plusieurs lignes est conservé', () => {
  assert.equal(
    buildTrayTooltip({ text: 'Ligne 1\nLigne 2', update: update({ level: 'ready', versionDisponible: '1' }), translate }),
    'Ligne 1\nLigne 2\ntray.updateReady(version=1)',
  );
});
