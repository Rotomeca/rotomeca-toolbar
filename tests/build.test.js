const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build, shouldCopy } = require('../scripts/build.js');

test('shouldCopy : le code, les pages et les ressources sont embarqués', () => {
  for (const file of [
    'main.js',
    'src/page.settings/settings.html',
    'src/css/app.css',
    'src/pictures/icon.png',
    'src/locales/fr.json',
    'lib/RotomecaWebComponents/libs/events_electron.js',
  ]) {
    assert.equal(shouldCopy(file), true, file);
  }
});

test('shouldCopy : les sources de styles et fichiers de génération ne le sont pas', () => {
  for (const file of [
    'src/page.add/less/add.less',
    'src/page.add/less',
    'src/index/less/index.less',
    'src/scripts/events/folder.buildable',
  ]) {
    assert.equal(shouldCopy(file), false, file);
  }
});

test('shouldCopy : les sources TypeScript ne sont jamais copiées (tsc et esbuild les compilent)', () => {
  assert.equal(shouldCopy('preload.ts'), false);
  assert.equal(shouldCopy('src/scripts/media/media-preload.ts'), false);
  assert.equal(shouldCopy('src\\scripts\\versions.ts'), false);
  assert.equal(shouldCopy('src/types/window-api.d.ts'), false);
  assert.equal(shouldCopy('src/scripts/media/other.js'), true);
});

test('shouldCopy : accepte les séparateurs Windows', () => {
  assert.equal(shouldCopy('src\\page.add\\less\\add.less'), false);
  assert.equal(shouldCopy('src\\page.add\\add.html'), true);
});

/** Dépôt factice minimal avec tout ce que build() embarque. */
function fakeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtb-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const files = {
    'main.js': '// main',
    'preload.ts':
      'import { ipcRenderer } from \'electron\'; import { shared } from \'./shared.js\'; export const api: string = shared; ipcRenderer.send(\'p\');',
    'shared.ts': 'export const shared: string = \'CONTENU-PARTAGE\';',
    'src/scripts/media/media-preload.ts': 'import { ipcRenderer } from \'electron\'; ipcRenderer.send(\'x\');',
    'index.html': '<html></html>',
    'src/scripts/a.js': '// a',
    'src/page.x/x.html': '<html></html>',
    'src/page.x/less/x.less': '// less',
    'src/events/folder.buildable': '',
    'lib/l.js': '// lib',
    'configs/appConfig.js': '// config',
    'node_modules/@rotomeca/design-system/out/ds.js': '// ds',
    'node_modules/@rotomeca/design-system/out/icons/a.svg': '<svg/>',
    'node_modules/@rotomeca/design-system/dist/types.d.ts': '// types',
    'tests/t.test.js': '// test',
    'scripts/s.js': '// script',
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

test('build : reproduit l\'arborescence dans dist/, design system compris', (t) => {
  const root = fakeRepo(t);
  const dist = build({ root, dist: path.join(root, 'dist') });
  const exists = (file) => fs.existsSync(path.join(dist, file));

  for (const file of [
    'main.js',
    'preload.js',
    'src/scripts/media/media-preload.js',
    'index.html',
    'src/scripts/a.js',
    'src/page.x/x.html',
    'lib/l.js',
    'configs/appConfig.js',
    'node_modules/@rotomeca/design-system/out/ds.js',
    'node_modules/@rotomeca/design-system/out/icons/a.svg',
  ]) {
    assert.ok(exists(file), `${file} manque`);
  }
});

test('build : n\'embarque ni les sources de styles, ni les tests, ni les scripts', (t) => {
  const root = fakeRepo(t);
  const dist = build({ root, dist: path.join(root, 'dist') });
  const exists = (file) => fs.existsSync(path.join(dist, file));

  for (const file of [
    'src/page.x/less',
    'src/events/folder.buildable',
    'tests',
    'scripts',
    'node_modules/@rotomeca/design-system/dist',
  ]) {
    assert.ok(!exists(file), `${file} ne devrait pas être embarqué`);
  }
});

test('build : repart de zéro à chaque fois', (t) => {
  const root = fakeRepo(t);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'ancien.js'), '// reste d\'un ancien build');

  build({ root, dist });
  assert.ok(!fs.existsSync(path.join(dist, 'ancien.js')));
});

test('build : erreur claire quand une source manque', (t) => {
  const root = fakeRepo(t);
  fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
  assert.throws(() => build({ root, dist: path.join(root, 'dist') }), /Introuvable.*design-system/);
});

test('build : le preload est un bundle unique, qui inclut ses imports et garde electron externe', (t) => {
  const root = fakeRepo(t);
  const dist = build({ root, dist: path.join(root, 'dist') });
  const bundle = fs.readFileSync(path.join(dist, 'preload.js'), 'utf8');

  assert.match(bundle, /CONTENU-PARTAGE/, 'le fichier importé est inclus');
  assert.doesNotMatch(bundle, /require\(["']\.{1,2}\//, 'aucun require relatif ne reste');
  assert.match(bundle, /require\("electron"\)/, 'electron reste externe');
  assert.doesNotMatch(bundle, /: string/, 'les types TypeScript sont retirés');
  assert.ok(!fs.existsSync(path.join(dist, 'shared.js')), 'le fichier importé ne doit pas être copié à part');
  assert.ok(!fs.existsSync(path.join(dist, 'preload.ts')), 'la source TypeScript n\'est pas copiée');
});

test('build : le preload des sites est bundlé lui aussi', (t) => {
  const root = fakeRepo(t);
  const dist = build({ root, dist: path.join(root, 'dist') });
  const bundle = fs.readFileSync(path.join(dist, 'src/scripts/media/media-preload.js'), 'utf8');

  assert.match(bundle, /require\("electron"\)/);
  assert.match(bundle, /ipcRenderer\.send\("x"\)/);
  assert.ok(!fs.existsSync(path.join(dist, 'src/scripts/media/media-preload.ts')));
});
