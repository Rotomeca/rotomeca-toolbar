const test = require('node:test');
const assert = require('node:assert/strict');
const { nextRc, parseArgs, setVersion } = require('../scripts/pre-release.js');

test('nextRc : 1 quand aucune pré-version n\'existe', () => {
  assert.equal(nextRc([], '3.4.0'), 1);
  assert.equal(nextRc(['3.3.0', '3.3.0-rc1', '3.2.0'], '3.4.0'), 1);
});

test('nextRc : suit le plus grand numéro existant pour cette version', () => {
  assert.equal(nextRc(['3.4.0-rc1'], '3.4.0'), 2);
  assert.equal(nextRc(['3.4.0-rc1', '3.4.0-rc3', '3.4.0-rc2'], '3.4.0'), 4);
  assert.equal(nextRc(['3.4.0-rc9', '3.4.0-rc10'], '3.4.0'), 11);
});

test('nextRc : ignore les autres versions et les formats voisins', () => {
  const tags = ['3.4.1-rc5', '13.4.0-rc7', '3.4.0', '3.4.0-beta2', '3.4.0-rc', 'x3.4.0-rc8', ' 3.4.0-rc2 '];
  assert.equal(nextRc(tags, '3.4.0'), 3);
});

test('nextRc : le point de la version n\'est pas un joker', () => {
  assert.equal(nextRc(['3x4.0-rc9'], '3.4.0'), 1);
});

test('parseArgs : version seule', () => {
  assert.deepEqual(parseArgs(['3.4.0']), { base: '3.4.0', rc: null, from: 'develop', push: false, dryRun: false });
});

test('parseArgs : options dans n\'importe quel ordre', () => {
  assert.deepEqual(parseArgs(['--push', '3.4.0', '--rc', '2', '--dry-run']), {
    base: '3.4.0',
    rc: 2,
    from: 'develop',
    push: true,
    dryRun: true,
  });
});

test('parseArgs : --from choisit la branche de départ', () => {
  assert.equal(parseArgs(['3.4.2', '--from', 'feature/refactor-ts']).from, 'feature/refactor-ts');
});

test('parseArgs : --from refuse une valeur absente ou suspecte', () => {
  for (const args of [['3.4.2', '--from'], ['3.4.2', '--from', 'a b'], ['3.4.2', '--from', '$(x)']]) {
    assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
  }
});

test('parseArgs : refuse une version absente ou mal formée', () => {
  for (const args of [[], ['--push'], ['3.4'], ['3.4.0-rc1'], ['v3.4.0'], ['3.4.0.1'], ['abc']]) {
    assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
  }
});

test('parseArgs : refuse --rc invalide, deux versions et options inconnues', () => {
  for (const args of [
    ['3.4.0', '--rc'],
    ['3.4.0', '--rc', '0'],
    ['3.4.0', '--rc', 'deux'],
    ['3.4.0', '--rc', '-1'],
    ['3.4.0', '3.5.0'],
    ['3.4.0', '--force'],
  ]) {
    assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
  }
});

test('setVersion : ne change que la version et garde le format du fichier', () => {
  const text = '{\r\n\t"name": "x",\r\n\t"version": "3.3.0",\r\n\t"main": "main.js"\r\n}\r\n';
  assert.equal(
    setVersion(text, '3.4.0-rc1'),
    '{\r\n\t"name": "x",\r\n\t"version": "3.4.0-rc1",\r\n\t"main": "main.js"\r\n}\r\n',
  );
});

test('setVersion : ne touche que le premier champ version', () => {
  const text = '{"version": "1.0.0", "dependencies": {"version": "9.9.9"}}';
  assert.equal(
    setVersion(text, '2.0.0-rc1'),
    '{"version": "2.0.0-rc1", "dependencies": {"version": "9.9.9"}}',
  );
});

test('setVersion : erreur claire sans champ version', () => {
  assert.throws(() => setVersion('{"name": "x"}', '1.0.0-rc1'), /version/);
});
