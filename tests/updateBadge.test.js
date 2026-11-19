const test = require('node:test');
const assert = require('node:assert/strict');
const { updateLevelOf, badgeCornerFor, paintUpdateBadge } = require('../dist/src/main/tray/updateBadge.js');

test('updateLevelOf : prête → ready, disponible ou en téléchargement → pending, sinon null', () => {
  assert.equal(updateLevelOf('ready'), 'ready');
  assert.equal(updateLevelOf('downloading'), 'pending');
  assert.equal(updateLevelOf('available'), 'pending');
  assert.equal(updateLevelOf('uptodate'), null);
  assert.equal(updateLevelOf(undefined), null);
});

test('badgeCornerFor : en haut pour une pré-version (le badge RC occupe le bas), en bas sinon', () => {
  assert.equal(badgeCornerFor(true), 'top-right');
  assert.equal(badgeCornerFor(false), 'bottom-right');
});

/**
 * Copie de la boucle de dessin qui se trouvait dans AppMain.trayIconFor : sert de référence
 * pour prouver que le dessin extrait donne exactement les mêmes pixels.
 */
function referencePaint(bitmap, size, level, topCorner) {
  const [b, g, r] = level === 'ready' ? [76, 175, 80] : [255, 152, 0];
  const radius = 8;
  const cx = size - radius - 1;
  const cy = topCorner ? radius + 1 : size - radius - 1;

  for (let y = 0; y < size; ++y) {
    for (let x = 0; x < size; ++x) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius + 1.5) continue;
      const i = (y * size + x) * 4;
      const [pb, pg, pr] = d <= radius - 1 ? [b, g, r] : [255, 255, 255];
      bitmap[i] = pb;
      bitmap[i + 1] = pg;
      bitmap[i + 2] = pr;
      bitmap[i + 3] = 255;
    }
  }
  return bitmap;
}

const icon = (size) => Buffer.from(Array.from({ length: size * size * 4 }, (_, i) => (i * 7) % 256));

test('paintUpdateBadge : mêmes pixels que l\'ancien dessin, pour chaque niveau et chaque coin', () => {
  for (const size of [16, 32, 48]) {
    for (const level of ['pending', 'ready']) {
      for (const corner of ['bottom-right', 'top-right']) {
        const painted = paintUpdateBadge(icon(size), size, level, corner);
        const expected = referencePaint(icon(size), size, level, corner === 'top-right');
        assert.ok(painted.equals(expected), `${size}px ${level} ${corner}`);
      }
    }
  }
});

test('paintUpdateBadge : modifie le bitmap donné et le renvoie', () => {
  const bitmap = icon(32);
  assert.equal(paintUpdateBadge(bitmap, 32, 'ready', 'bottom-right'), bitmap);
});

test('paintUpdateBadge : le coin choisi est coloré, le coin opposé reste intact', () => {
  const size = 32;
  const pixel = (bitmap, x, y) => [...bitmap.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  const original = icon(size);

  const bottom = paintUpdateBadge(Buffer.from(original), size, 'ready', 'bottom-right');
  assert.deepEqual(pixel(bottom, 23, 23), [76, 175, 80, 255], 'centre de la pastille, en bas à droite');
  assert.deepEqual(pixel(bottom, 23, 9), pixel(original, 23, 9), 'haut à droite intact');

  const top = paintUpdateBadge(Buffer.from(original), size, 'pending', 'top-right');
  assert.deepEqual(pixel(top, 23, 9), [255, 152, 0, 255], 'centre de la pastille, en haut à droite');
  assert.deepEqual(pixel(top, 23, 23), pixel(original, 23, 23), 'bas à droite intact');
});

test('paintUpdateBadge : un liseré blanc entoure la pastille', () => {
  const size = 32;
  const bitmap = paintUpdateBadge(Buffer.alloc(size * size * 4), size, 'ready', 'bottom-right');
  const at = (x, y) => [...bitmap.subarray((y * size + x) * 4, (y * size + x) * 4 + 3)];
  // Centre (23, 23), rayon 8 : à 8,5 px du centre, on est dans le liseré
  assert.deepEqual(at(23 + 8, 23), [255, 255, 255]);
});

test('paintUpdateBadge : le reste de l\'icône n\'est pas touché', () => {
  const size = 32;
  const original = icon(size);
  const painted = paintUpdateBadge(Buffer.from(original), size, 'pending', 'bottom-right');
  // Le coin haut gauche est loin de la pastille
  assert.ok(painted.subarray(0, 4 * 8).equals(original.subarray(0, 4 * 8)));
});
