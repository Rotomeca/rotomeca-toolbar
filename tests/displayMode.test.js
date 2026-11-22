const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDisplayMode } = require('../dist/src/main/toolbar/displayMode.js');

const mode = (isButtonModeEnabled, appBarEnabled, appBarAutoHide, supported = true) =>
  ({ ...resolveDisplayMode({ isButtonModeEnabled, appBarEnabled, appBarAutoHide }, supported) });

test('mode bouton par défaut', () => {
  assert.deepEqual(mode(true, false, false), { appBar: false, button: true, autoHide: false, usesEdge: false });
});

test('mode souris : ni bouton ni barre ancrée, la zone de bord ouvre la barre', () => {
  assert.deepEqual(mode(false, false, false), { appBar: false, button: false, autoHide: false, usesEdge: true });
});

test('barre ancrée : elle prime sur le mode bouton', () => {
  assert.deepEqual(mode(true, true, false), { appBar: true, button: false, autoHide: false, usesEdge: false });
});

test('barre ancrée : elle prime sur le mode souris', () => {
  assert.equal(mode(false, true, false).usesEdge, false);
});

test('masquage automatique : seulement avec la barre ancrée', () => {
  assert.equal(mode(true, true, true).autoHide, true);
  assert.equal(mode(true, false, true).autoHide, false);
});

test('barre ancrée non prise en charge : retour au mode bouton ou souris, sans masquage automatique', () => {
  assert.deepEqual(mode(true, true, true, false), { appBar: false, button: true, autoHide: false, usesEdge: false });
  assert.deepEqual(mode(false, true, true, false), { appBar: false, button: false, autoHide: false, usesEdge: true });
});

test('exactement un des modes bouton, barre ancrée ou souris est actif', () => {
  for (const button of [true, false]) {
    for (const appBar of [true, false]) {
      for (const autoHide of [true, false]) {
        for (const supported of [true, false]) {
          const m = mode(button, appBar, autoHide, supported);
          assert.equal([m.button, m.appBar, m.usesEdge].filter(Boolean).length, 1, JSON.stringify(m));
        }
      }
    }
  }
});
