const test = require('node:test');
const assert = require('node:assert/strict');
const { createPermissionDialog } = require('../dist/src/main/permissions/permissionDialog.js');

/** Faux `translate` : rend la clé et ses variables lisibles dans les assertions. */
const translate = (key, variables = {}) => {
  const values = Object.entries(variables).map(([name, value]) => `${name}=${value}`).join(',');
  return values ? `${key}(${values})` : key;
};

/** Fausse boîte de dialogue : mémorise les options reçues et répond avec le bouton choisi. */
function fakeDialog(response) {
  const dialog = {
    calls: [],
    showMessageBox: async (options) => {
      dialog.calls.push(options);
      return { response };
    },
  };
  return dialog;
}

test('permissionDialog : « Autoriser » (premier bouton) autorise', async () => {
  const ask = createPermissionDialog({ dialog: fakeDialog(0), translate });
  assert.equal(await ask('https://meet.example.com', 'media'), true);
});

test('permissionDialog : « Refuser » (second bouton) refuse', async () => {
  const ask = createPermissionDialog({ dialog: fakeDialog(1), translate });
  assert.equal(await ask('https://meet.example.com', 'media'), false);
});

test('permissionDialog : toute autre réponse refuse', async () => {
  for (const response of [2, -1, undefined, null]) {
    const ask = createPermissionDialog({ dialog: fakeDialog(response), translate });
    assert.equal(await ask('https://x.test', 'media'), false, String(response));
  }
});

test('permissionDialog : le refus est la réponse par défaut et celle de la fermeture', async () => {
  const dialog = fakeDialog(1);
  await createPermissionDialog({ dialog, translate })('https://x.test', 'geolocation');

  const [options] = dialog.calls;
  assert.equal(options.defaultId, 1);
  assert.equal(options.cancelId, 1);
  assert.deepEqual(options.buttons, ['permission.allow', 'permission.deny']);
  assert.equal(options.type, 'question');
});

test('permissionDialog : affiche le site, la permission demandée et la mémorisation', async () => {
  const dialog = fakeDialog(1);
  const ask = createPermissionDialog({ dialog, translate });

  await ask('https://meet.example.com', 'media');
  await ask('https://maps.example.com', 'geolocation');

  assert.equal(dialog.calls[0].title, 'permission.title');
  assert.equal(dialog.calls[0].message, 'permission.message(origin=https://meet.example.com,action=permission.media)');
  assert.equal(dialog.calls[1].message, 'permission.message(origin=https://maps.example.com,action=permission.geolocation)');
  assert.equal(dialog.calls[0].detail, 'permission.remembered');
});

test('permissionDialog : une permission inconnue est nommée telle quelle', async () => {
  const dialog = fakeDialog(1);
  await createPermissionDialog({ dialog, translate })('https://x.test', 'usb');
  assert.match(dialog.calls[0].message, /action=usb/);
});
