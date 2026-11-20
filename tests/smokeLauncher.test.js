const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  executableName,
  findPackageDir,
  smokeArgs,
} = require('../scripts/smoke.js');

test('parseArgs : sans argument, on lance Electron en développement', () => {
  assert.deepEqual(parseArgs([]), { packaged: false });
});

test('parseArgs : --packaged vise le paquet construit', () => {
  assert.deepEqual(parseArgs(['--packaged']), { packaged: true });
});

test('parseArgs : refuse un argument inconnu', () => {
  assert.throws(() => parseArgs(['--fast']), /inattendu/);
});

test('executableName : .exe sous Windows seulement', () => {
  assert.equal(executableName('win32'), 'rotomecatoolbar.exe');
  assert.equal(executableName('linux'), 'rotomecatoolbar');
  assert.equal(executableName('darwin'), 'rotomecatoolbar');
});

test('findPackageDir : trouve le dossier de la plateforme courante', () => {
  const entries = ['make', 'rotomecatoolbar-linux-x64', 'rotomecatoolbar-win32-x64'];
  assert.equal(findPackageDir(entries, 'win32'), 'rotomecatoolbar-win32-x64');
  assert.equal(findPackageDir(entries, 'linux'), 'rotomecatoolbar-linux-x64');
});

test('findPackageDir : null quand le paquet de cette plateforme est absent', () => {
  assert.equal(findPackageDir(['make'], 'win32'), null);
  assert.equal(findPackageDir([], 'win32'), null);
});

const options = { reportFile: '/tmp/r.json', userDataDir: '/tmp/u', platform: 'win32', ci: false };

test('smokeArgs : mode fumée, rapport et dossier de données dédiés', () => {
  assert.deepEqual(smokeArgs(options), [
    '--smoke',
    '--smoke-out=/tmp/r.json',
    '--smoke-user-data=/tmp/u',
  ]);
});

test('smokeArgs : --no-sandbox seulement sur Linux en intégration continue', () => {
  assert.equal(smokeArgs({ ...options, platform: 'linux', ci: true })[0], '--no-sandbox');
  assert.ok(!smokeArgs({ ...options, platform: 'linux', ci: false }).includes('--no-sandbox'));
  assert.ok(!smokeArgs({ ...options, platform: 'win32', ci: true }).includes('--no-sandbox'));
});
