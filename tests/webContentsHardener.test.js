const test = require('node:test');
const assert = require('node:assert/strict');
const { hardenWebContents } = require('../dist/src/main/security/webContentsHardener.js');

/** Un faux WebContents qui mémorise ce que le durcissement lui installe. */
function fakeContents() {
  const contents = {
    openHandler: null,
    listeners: {},
    setWindowOpenHandler: (handler) => {
      contents.openHandler = handler;
    },
    on: (event, listener) => {
      contents.listeners[event] = listener;
    },
  };
  return contents;
}

const fakeEvent = () => {
  const event = { prevented: false, preventDefault: () => (event.prevented = true) };
  return event;
};

test('popups : une adresse http(s) est autorisée, sans barre de menus', () => {
  const contents = fakeContents();
  hardenWebContents(contents);

  for (const url of ['https://accounts.example.com/oauth', 'http://localhost:3000']) {
    assert.deepEqual(contents.openHandler({ url }), {
      action: 'allow',
      overrideBrowserWindowOptions: { autoHideMenuBar: true },
    });
  }
});

test('popups : tout autre schéma est refusé', () => {
  const contents = fakeContents();
  hardenWebContents(contents);

  for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,<script>', 'chrome://settings', '']) {
    assert.deepEqual(contents.openHandler({ url }), { action: 'deny' }, url);
  }
});

test('navigation : un schéma dangereux est bloqué, http(s) est laissé passer', () => {
  const contents = fakeContents();
  hardenWebContents(contents);

  for (const eventName of ['will-navigate', 'will-redirect']) {
    const blocked = fakeEvent();
    contents.listeners[eventName](blocked, 'file:///C:/secret');
    assert.equal(blocked.prevented, true, eventName);

    const allowed = fakeEvent();
    contents.listeners[eventName](allowed, 'https://example.com/page');
    assert.equal(allowed.prevented, false, eventName);
  }
});

test('<webview> : toujours interdit', () => {
  const contents = fakeContents();
  hardenWebContents(contents);

  const event = fakeEvent();
  contents.listeners['will-attach-webview'](event);
  assert.equal(event.prevented, true);
});

test('popups autorisées : leur contenu est durci de la même façon', () => {
  const contents = fakeContents();
  const child = fakeContents();
  hardenWebContents(contents);

  contents.listeners['did-create-window']({ webContents: child });

  assert.deepEqual(child.openHandler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  const event = fakeEvent();
  child.listeners['will-navigate'](event, 'data:text/html,x');
  assert.equal(event.prevented, true);
});

test('durcissement : le critère de sécurité peut être remplacé', () => {
  const contents = fakeContents();
  hardenWebContents(contents, (url) => url === 'https://seul-autorise.test/');

  assert.equal(contents.openHandler({ url: 'https://seul-autorise.test/' }).action, 'allow');
  assert.equal(contents.openHandler({ url: 'https://autre.test/' }).action, 'deny');
});
