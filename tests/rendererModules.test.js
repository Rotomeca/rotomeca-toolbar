const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Les modules des pages sont des modules ES (sans package.json voisin) : on les charge par import()
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'dist', file)).href);

// #region mediaView

test('formatTime : minutes et secondes sur deux chiffres', async () => {
  const { formatTime } = await load('src/scripts/mediaView.js');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3600), '60:00');
});

test('formatTime : arrondit vers le bas et refuse les valeurs négatives', async () => {
  const { formatTime } = await load('src/scripts/mediaView.js');
  assert.equal(formatTime(59.9), '0:59');
  assert.equal(formatTime(-12), '0:00');
});

test('progressPercent : pourcentage entier, position inconnue = 0', async () => {
  const { progressPercent } = await load('src/scripts/mediaView.js');
  assert.equal(progressPercent(50, 200), 25);
  assert.equal(progressPercent(null, 200), 0);
  assert.equal(progressPercent(200, 200), 100);
  assert.equal(progressPercent(1, 3), 33);
});

// #endregion

// #region requireElement

test('requireElement : renvoie l\'élément trouvé', async () => {
  const { requireElement } = await load('src/scripts/dom.js');
  const node = { id: 'x' };
  const root = { querySelector: (selector) => (selector === '#x' ? node : null) };
  assert.equal(requireElement('#x', root), node);
});

test('requireElement : lève MissingElementError avec le sélecteur quand l\'élément manque', async () => {
  const { requireElement, MissingElementError } = await load('src/scripts/dom.js');
  const root = { querySelector: () => null };
  assert.throws(
    () => requireElement('#absent', root),
    (error) => error instanceof MissingElementError && error instanceof Error && /#absent/.test(error.message) && error.name === 'MissingElementError',
  );
});

// #endregion
