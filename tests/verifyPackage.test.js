const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requiredEntries,
  forbiddenEntries,
  normalizeAsarPaths,
  missingEntries,
  unexpectedEntries,
} = require('../scripts/verify-package.js');

test('requiredEntries : sans dist/, les fichiers sont attendus à la racine de l archive', () => {
  const entries = requiredEntries('main.js');
  assert.ok(entries.includes('/main.js'));
  assert.ok(entries.includes('/package.json'));
  assert.ok(entries.includes('/preload.js'));
  assert.ok(entries.includes('/src/scripts/media/media-preload.js'));
  assert.ok(entries.includes('/node_modules/@rotomeca/design-system/out/rotomeca-design-system.js'));
});

test('requiredEntries : avec dist/, tout est attendu sous dist/ (sauf package.json)', () => {
  const entries = requiredEntries('dist/main.js');
  assert.ok(entries.includes('/dist/main.js'));
  assert.ok(entries.includes('/dist/preload.js'));
  assert.ok(entries.includes('/dist/index.html'));
  assert.ok(entries.includes('/package.json'));
  assert.ok(!entries.includes('/preload.js'));
});

test('requiredEntries : accepte un chemin Windows', () => {
  assert.ok(requiredEntries('dist\\main.js').includes('/dist/main.js'));
});

test('normalizeAsarPaths : uniformise séparateurs et préfixes', () => {
  const normalized = normalizeAsarPaths(['\\main.js', '/src/a.json', 'src\\b.json']);
  assert.deepEqual([...normalized].sort(), ['/main.js', '/src/a.json', '/src/b.json']);
});

test('missingEntries : liste ce qui manque, et seulement cela', () => {
  const present = new Set(['/main.js', '/package.json']);
  assert.deepEqual(missingEntries(present, ['/main.js', '/preload.js', '/package.json']), ['/preload.js']);
  assert.deepEqual(missingEntries(present, ['/main.js']), []);
});

test('missingEntries : tout manque pour une archive vide', () => {
  assert.deepEqual(missingEntries(new Set(), ['/a', '/b']), ['/a', '/b']);
});

test('forbiddenEntries : rien d\'interdit tant que le code n\'est pas dans dist/', () => {
  assert.deepEqual(forbiddenEntries('main.js'), []);
});

test('forbiddenEntries : avec dist/, les sources et outils sont interdits à la racine', () => {
  const forbidden = forbiddenEntries('dist/main.js');
  for (const entry of ['/main.js', '/src', '/lib', '/tests', '/scripts', '/plan-refonte'])
    assert.ok(forbidden.includes(entry), entry);
  assert.ok(!forbidden.includes('/dist'));
  assert.ok(!forbidden.includes('/node_modules'));
});

test('unexpectedEntries : repère un fichier interdit et le contenu d\'un dossier interdit', () => {
  const present = new Set(['/dist/main.js', '/main.js', '/tests/a.test.js', '/node_modules/x/index.js']);
  assert.deepEqual(unexpectedEntries(present, ['/main.js', '/tests', '/src']), ['/main.js', '/tests']);
});

test('unexpectedEntries : un nom qui commence pareil n\'est pas un faux positif', () => {
  const present = new Set(['/dist/src/a.js', '/srcmap.json', '/main.jsx']);
  assert.deepEqual(unexpectedEntries(present, ['/src', '/main.js']), []);
});

test('unexpectedEntries : archive conforme, rien à signaler', () => {
  assert.deepEqual(unexpectedEntries(new Set(['/dist/main.js', '/package.json']), ['/main.js', '/src']), []);
});
