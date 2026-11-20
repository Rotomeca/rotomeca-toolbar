const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveUpdateMode, createFeedSwitcher, feedUrlFor } = require('../dist/src/main/updates/updateMode.js');

const env = (overrides) => ({ isDev: false, isPackaged: true, platform: 'win32', simulateRequested: false, ...overrides });

test('resolveUpdateMode : application empaquetée sous Windows → Squirrel', () => {
  assert.deepEqual(resolveUpdateMode(env({ platform: 'win32' })), { simulate: false, squirrel: true, appImage: false, manual: false });
});

test('resolveUpdateMode : application empaquetée sous Linux → vérification manuelle', () => {
  assert.deepEqual(resolveUpdateMode(env({ platform: 'linux' })), { simulate: false, squirrel: false, appImage: false, manual: true });
});

test('resolveUpdateMode : AppImage empaquetée sous Linux → electron-updater, sans vérification manuelle', () => {
  assert.deepEqual(resolveUpdateMode(env({ platform: 'linux', appImage: true })), {
    simulate: false,
    squirrel: false,
    appImage: true,
    manual: false,
  });
});

test('resolveUpdateMode : APPIMAGE est ignoré hors Linux ou hors paquet', () => {
  assert.equal(resolveUpdateMode(env({ platform: 'win32', appImage: true })).appImage, false);
  assert.equal(resolveUpdateMode(env({ platform: 'linux', appImage: true, isPackaged: false })).appImage, false);
  assert.equal(resolveUpdateMode(env({ platform: 'linux', appImage: true, isDev: true })).appImage, false);
});

test('resolveUpdateMode : en développement, ni Squirrel ni vérification manuelle', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    assert.deepEqual(resolveUpdateMode(env({ isDev: true, isPackaged: false, platform })), {
      simulate: false,
      squirrel: false,
      appImage: false,
      manual: false,
    });
  }
});

test('resolveUpdateMode : lancée depuis les sources (non empaquetée), pas de mise à jour', () => {
  assert.deepEqual(resolveUpdateMode(env({ isPackaged: false })), {
    simulate: false,
    squirrel: false,
    appImage: false,
    manual: false,
  });
});

test('resolveUpdateMode : la simulation n\'existe qu\'en développement', () => {
  assert.equal(resolveUpdateMode(env({ isDev: true, isPackaged: false, simulateRequested: true })).simulate, true);
  assert.equal(resolveUpdateMode(env({ isDev: false, simulateRequested: true })).simulate, false);
  assert.equal(resolveUpdateMode(env({ isDev: true, isPackaged: false, simulateRequested: false })).simulate, false);
});

test('resolveUpdateMode : le mode développement l\'emporte sur « empaquetée »', () => {
  assert.equal(resolveUpdateMode(env({ isDev: true, isPackaged: true })).squirrel, false);
});

test('resolveUpdateMode : Squirrel, AppImage et vérification manuelle s\'excluent toujours', () => {
  for (const isDev of [true, false]) {
    for (const isPackaged of [true, false]) {
      for (const platform of ['win32', 'linux', 'darwin', 'freebsd']) {
        const mode = resolveUpdateMode(env({ isDev, isPackaged, platform }));
        const active = [mode.squirrel, mode.appImage, mode.manual].filter(Boolean).length;
        assert.ok(active <= 1, `${isDev}/${isPackaged}/${platform}`);
      }
    }
  }
});

test('feedUrlFor : <serveur>/update/<plateforme>/<version>', () => {
  assert.equal(feedUrlFor('https://maj.example.com', 'win32', '3.4.1'), 'https://maj.example.com/update/win32/3.4.1');
});

function switcher(testUrl) {
  const applied = [];
  const switchTo = createFeedSwitcher({
    stableUrl: 'https://stable.example.com',
    testUrl,
    platform: 'win32',
    version: '3.4.1',
    apply: (url) => applied.push(url),
  });
  return { switchTo, applied };
}

test('createFeedSwitcher : oriente Squirrel vers le serveur des versions publiées ou des pré-versions', () => {
  const { switchTo, applied } = switcher('https://test.example.com');

  switchTo('stable');
  switchTo('test');

  assert.deepEqual(applied, [
    'https://stable.example.com/update/win32/3.4.1',
    'https://test.example.com/update/win32/3.4.1',
  ]);
});

test('createFeedSwitcher : sans serveur de test, demander « test » ne change rien', () => {
  const { switchTo, applied } = switcher(null);

  switchTo('test');
  assert.deepEqual(applied, []);

  switchTo('stable');
  assert.deepEqual(applied, ['https://stable.example.com/update/win32/3.4.1']);
});
