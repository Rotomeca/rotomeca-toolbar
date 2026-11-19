const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { iconBaseName } = require('../src/scripts/appIcon.js');

const PICTURES = path.join(__dirname, '..', 'src', 'pictures');

test('iconBaseName : icône normale pour une release', () => {
  assert.equal(iconBaseName('3.4.0'), 'icon');
  assert.equal(iconBaseName('v3.4.0'), 'icon');
  assert.equal(iconBaseName('3.4'), 'icon');
});

test('iconBaseName : icône RC pour une pré-version', () => {
  assert.equal(iconBaseName('3.4.0-rc1'), 'icon-rc');
  assert.equal(iconBaseName('3.4.0-rc12'), 'icon-rc');
});

test('iconBaseName : valeur invalide, icône normale sans lever', () => {
  assert.doesNotThrow(() => iconBaseName(undefined));
  assert.equal(iconBaseName(undefined), 'icon');
  assert.equal(iconBaseName(''), 'icon');
});

for (const name of ['icon', 'icon-rc']) {
  test(`${name}.png : PNG valide de 512x512`, () => {
    const png = fs.readFileSync(path.join(PICTURES, `${name}.png`));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
  });

  test(`${name}.ico : ICO valide avec les tailles 16 à 256`, () => {
    const ico = fs.readFileSync(path.join(PICTURES, `${name}.ico`));
    // En-tête ICO : réservé = 0, type = 1 (icône), puis le nombre d'images
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);

    const count = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; ++i) sizes.push(ico[6 + i * 16] || 256);

    for (const size of [16, 32, 48, 256])
      assert.ok(sizes.includes(size), `taille ${size} absente (${sizes})`);
  });
}
