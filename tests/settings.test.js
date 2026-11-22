const test = require('node:test');
const assert = require('node:assert/strict');
const {
  THEMES, SEASON_THEMES, sanitizeTheme, sanitizeDensity, sanitizeDisplayId, resolveTheme,
} = require('../dist/src/main/settings/themes.js');
const { Settings } = require('../dist/src/main/settings/Settings.js');
const { buildThemeScript } = require('../dist/src/main/theming/themeScript.js');

// #region themes

test('sanitizeTheme : un thème connu est conservé', () => {
  for (const theme of THEMES) assert.equal(sanitizeTheme(theme), theme);
});

test('sanitizeTheme : les anciens noms sont convertis', () => {
  assert.equal(sanitizeTheme('dark'), 'sombre');
  assert.equal(sanitizeTheme('red'), 'rouge');
  assert.equal(sanitizeTheme('black'), 'noir');
});

test('sanitizeTheme : tout le reste donne le thème par défaut', () => {
  for (const value of [undefined, null, 3, {}, 'inconnu', '', '__proto__', 'constructor', 'toString']) {
    assert.equal(sanitizeTheme(value), 'system', String(value));
  }
});

test('resolveTheme : « system » suit le mode sombre du système', () => {
  assert.deepEqual({ ...resolveTheme('system', true) }, { theme: 'dark', palette: '' });
  assert.deepEqual({ ...resolveTheme('system', false) }, { theme: 'light', palette: '' });
});

test('resolveTheme : un thème explicite ignore le système', () => {
  assert.deepEqual({ ...resolveTheme('ete', true) }, { theme: 'light', palette: 'ete' });
  assert.deepEqual({ ...resolveTheme('noir', false) }, { theme: 'dark', palette: 'noir' });
});

test('resolveTheme : une valeur invalide se comporte comme « system »', () => {
  assert.deepEqual({ ...resolveTheme('???', true) }, { theme: 'dark', palette: '' });
});

test('SEASON_THEMES : chaque thème de saison existe', () => {
  for (const theme of SEASON_THEMES) assert.ok(THEMES.includes(theme), theme);
});

test('sanitizeDensity : valeurs connues conservées, sinon « normale »', () => {
  assert.equal(sanitizeDensity('discrete'), 'discrete');
  assert.equal(sanitizeDensity('abondante'), 'abondante');
  assert.equal(sanitizeDensity('énorme'), 'normale');
  assert.equal(sanitizeDensity(undefined), 'normale');
});

test('sanitizeDisplayId : entier sûr ou null', () => {
  assert.equal(sanitizeDisplayId(42), 42);
  assert.equal(sanitizeDisplayId(0), 0);
  for (const value of ['1', 1.5, NaN, Infinity, null, undefined, 2 ** 60]) assert.equal(sanitizeDisplayId(value), null);
});

// #endregion

// #region Settings

const memoryStore = (initial = false) => {
  const store = { path: '/x/settings.rcft', saved: [], load: () => initial, save: (data) => store.saved.push(data) };
  return store;
};
const seasonal = () => 'hiver';

test('Settings : valeurs par défaut sans fichier', () => {
  const settings = new Settings(memoryStore(false), seasonal);
  assert.equal(settings.isButtonModeEnabled, true);
  assert.equal(settings.appBarEnabled, false);
  assert.equal(settings.appBarAutoHide, false);
  assert.equal(settings.theme, 'system');
  assert.equal(settings.themeAuto, false);
  assert.equal(settings.effetsSaison, true);
  assert.equal(settings.densiteEffets, 'normale');
  assert.equal(settings.displayId, null);
  assert.equal(settings.filePath, '/x/settings.rcft');
});

test('Settings : lit les valeurs enregistrées et corrige les invalides', () => {
  const settings = new Settings(memoryStore({ theme: 'red', isButtonModeEnabled: false, densiteEffets: 'x', displayId: '3' }), seasonal);
  assert.equal(settings.theme, 'rouge');
  assert.equal(settings.isButtonModeEnabled, false);
  assert.equal(settings.densiteEffets, 'normale');
  assert.equal(settings.displayId, null);
});

test('Settings : un fichier qui n\'est pas un objet donne les valeurs par défaut', () => {
  for (const content of [null, 'texte', 12, false]) {
    assert.equal(new Settings(memoryStore(content), seasonal).theme, 'system');
  }
});

test('Settings : un magasin qui lève donne les valeurs par défaut', (t) => {
  t.mock.method(console, 'error', () => {});
  const store = { path: 'p', load: () => { throw new Error('illisible'); }, save: () => {} };
  assert.equal(new Settings(store, seasonal).appBarEnabled, false);
});

test('Settings : les écritures sont validées', () => {
  const settings = new Settings(memoryStore(false), seasonal);
  settings.theme = 'nimporte';
  settings.appBarEnabled = 'oui';
  settings.densiteEffets = 'abondante';
  settings.displayId = 7.5;
  assert.equal(settings.theme, 'system');
  assert.equal(settings.appBarEnabled, false);
  assert.equal(settings.densiteEffets, 'abondante');
  assert.equal(settings.displayId, null);
});

test('Settings : save écrit l\'ensemble des réglages validés', () => {
  const store = memoryStore({ theme: 'bleu', extra: 'ignoré' });
  const settings = new Settings(store, seasonal);
  settings.appBarEnabled = true;
  settings.save();
  assert.deepEqual(store.saved[0], {
    isButtonModeEnabled: true,
    appBarEnabled: true,
    appBarAutoHide: false,
    theme: 'bleu',
    themeAuto: false,
    effetsSaison: true,
    momentsMeteo: true,
    densiteEffets: 'normale',
    displayId: null,
  });
});

test('Settings : « Moments et météo » est activé par défaut et ne se coupe que par false', () => {
  const settings = new Settings(memoryStore(false), seasonal);
  assert.equal(settings.momentsMeteo, true);
  settings.momentsMeteo = false;
  assert.equal(settings.momentsMeteo, false);
  settings.momentsMeteo = 'non';
  assert.equal(settings.momentsMeteo, true);
});

test('Settings : le thème effectif suit la saison en mode automatique seulement', () => {
  const settings = new Settings(memoryStore({ theme: 'clair' }), seasonal);
  assert.equal(settings.effectiveTheme, 'clair');
  settings.themeAuto = true;
  assert.equal(settings.effectiveTheme, 'hiver');
});

// #endregion

// #region buildThemeScript

const input = (overrides) => ({ effectiveTheme: 'system', effectsEnabled: true, effectsDensity: 'normale', systemIsDark: false, ...overrides });

test('buildThemeScript : applique thème, palette et densité', () => {
  const script = buildThemeScript(input({ effectiveTheme: 'noel', effectsDensity: 'abondante' }));
  assert.match(script, /h\.dataset\.theme = "dark"/);
  assert.match(script, /h\.dataset\.palette = "noel"/);
  assert.match(script, /h\.dataset\.fx = "on"/);
  assert.match(script, /h\.dataset\.fxDensity = "abondante"/);
});

test('buildThemeScript : pas d\'effets sur un thème qui n\'est pas de saison', () => {
  assert.match(buildThemeScript(input({ effectiveTheme: 'rouge' })), /h\.dataset\.fx = "off"/);
});

test('buildThemeScript : pas d\'effets quand ils sont désactivés', () => {
  assert.match(buildThemeScript(input({ effectiveTheme: 'noel', effectsEnabled: false })), /h\.dataset\.fx = "off"/);
});

test('buildThemeScript : pose data-moment, ou le retire sans moment', () => {
  assert.match(buildThemeScript(input({ effectiveTheme: 'hiver', moment: 'aube' })), /h\.dataset\.moment = "aube"/);
  assert.match(buildThemeScript(input({ effectiveTheme: 'hiver' })), /delete h\.dataset\.moment/);
});

test('buildThemeScript : seul l\'été la nuit change de palette', () => {
  const night = buildThemeScript(input({ effectiveTheme: 'ete', moment: 'nuit' }));
  assert.match(night, /h\.dataset\.palette = "ete-nuit"/);
  assert.match(night, /h\.dataset\.theme = "dark"/);
  assert.match(buildThemeScript(input({ effectiveTheme: 'automne', moment: 'nuit' })), /h\.dataset\.palette = "automne"/);
  assert.match(buildThemeScript(input({ effectiveTheme: 'ete', moment: 'jour' })), /h\.dataset\.palette = "ete"/);
});

test('buildThemeScript : « system » suit le mode sombre du système', () => {
  assert.match(buildThemeScript(input({ systemIsDark: true })), /h\.dataset\.theme = "dark"/);
  assert.match(buildThemeScript(input({ systemIsDark: false })), /h\.dataset\.theme = "light"/);
});

// #endregion
