const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isLocalPageUrl, lockLocalContents } = require('../dist/src/main/security/localPageGuard.js');
const { hasDebuggingSwitch } = require('../dist/src/main/security/launchArguments.js');

const APP_ROOT = path.resolve('app-root');
const pageUrl = (...parts) => pathToFileURL(path.join(APP_ROOT, ...parts)).href;

test('isLocalPageUrl : une page de l\'application est locale', () => {
  assert.equal(isLocalPageUrl(pageUrl('src', 'page.add', 'add.html'), APP_ROOT), true);
});

test('isLocalPageUrl : un fichier hors de l\'application, un partage réseau ou un autre schéma ne le sont pas', () => {
  const outside = pathToFileURL(path.resolve('ailleurs', 'page.html')).href;
  for (const url of [outside, pageUrl('..', 'voisin.html'), 'file://serveur/partage/a.html', 'https://exemple.fr', 'data:text/html,x', 'about:blank', '', 'pas une url']) {
    assert.equal(isLocalPageUrl(url, APP_ROOT), false, url);
  }
});

/** Faux WebContents qui mémorise ce que le verrou lui installe. */
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

test('lockLocalContents : une popup est toujours refusée, une adresse http(s) part dans le navigateur du système', () => {
  const opened = [];
  const contents = fakeContents();
  lockLocalContents(contents, { appRoot: APP_ROOT, openExternal: (url) => opened.push(url) });

  assert.deepEqual(contents.openHandler({ url: 'https://exemple.fr/page' }), { action: 'deny' });
  assert.deepEqual(contents.openHandler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepEqual(contents.openHandler({ url: 'file:///C:/secret' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://exemple.fr/page']);
});

test('lockLocalContents : la navigation hors de l\'application est bloquée, celle vers une page locale passe', () => {
  const contents = fakeContents();
  lockLocalContents(contents, { appRoot: APP_ROOT, openExternal: () => {} });

  for (const eventName of ['will-navigate', 'will-redirect']) {
    const blocked = fakeEvent();
    contents.listeners[eventName](blocked, 'https://exemple.fr');
    assert.equal(blocked.prevented, true, eventName);

    const blockedFile = fakeEvent();
    contents.listeners[eventName](blockedFile, pathToFileURL(path.resolve('ailleurs', 'x.html')).href);
    assert.equal(blockedFile.prevented, true, eventName);

    const allowed = fakeEvent();
    contents.listeners[eventName](allowed, pageUrl('src', 'page.add', 'edit.html'));
    assert.equal(allowed.prevented, false, eventName);
  }
});

test('lockLocalContents : <webview> interdit', () => {
  const contents = fakeContents();
  lockLocalContents(contents, { appRoot: APP_ROOT, openExternal: () => {} });

  const event = fakeEvent();
  contents.listeners['will-attach-webview'](event);
  assert.equal(event.prevented, true);
});

test('hasDebuggingSwitch : détecte les options de débogage, avec ou sans valeur', () => {
  for (const argument of ['--remote-debugging-port=9222', '--remote-debugging-port', '--remote-debugging-pipe', '--inspect', '--inspect=9229', '--inspect-brk=0']) {
    assert.equal(hasDebuggingSwitch(['app.exe', argument]), true, argument);
  }
});

test('hasDebuggingSwitch : les autres arguments sont acceptés', () => {
  assert.equal(hasDebuggingSwitch(['app.exe', '--smoke', '--dev', '--smoke-out=a.json', '--inspector-like']), false);
  assert.equal(hasDebuggingSwitch([]), false);
});
