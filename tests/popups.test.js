const test = require('node:test');
const assert = require('node:assert/strict');
const { MediaPopup } = require('../dist/src/main/media/MediaPopup.js');
const { TooltipPopup, parseTooltipRequest } = require('../dist/src/main/tooltip/TooltipPopup.js');
const { postWhenLoaded } = require('../dist/src/main/windows/popupWindow.js');

function fakePopupWindow({ loading = false } = {}) {
  const win = {
    visible: false, destroyed: false, loading, position: null, messages: [], pendingLoad: [],
    isDestroyed: () => win.destroyed,
    isVisible: () => win.visible,
    hide: () => { win.visible = false; },
    showInactive: () => { win.visible = true; },
    setPosition: (x, y) => { win.position = [x, y]; },
    webContents: {
      isLoading: () => win.loading,
      once: (_, listener) => win.pendingLoad.push(listener),
      postMessage: (channel, payload) => win.messages.push([channel, payload]),
    },
  };
  return win;
}

// #region postWhenLoaded

test('postWhenLoaded : envoie tout de suite quand la page est chargée', () => {
  const win = fakePopupWindow();
  postWhenLoaded(win, 'c', 1);
  assert.deepEqual(win.messages, [['c', 1]]);
});

test('postWhenLoaded : attend la fin du chargement', () => {
  const win = fakePopupWindow({ loading: true });
  postWhenLoaded(win, 'c', 1);
  assert.deepEqual(win.messages, []);
  win.pendingLoad[0]();
  assert.deepEqual(win.messages, [['c', 1]]);
});

// #endregion

// #region parseTooltipRequest

test('parseTooltipRequest : texte et pastille tronqués', () => {
  const r = parseTooltipRequest({ text: 'x'.repeat(500), badge: 'y'.repeat(50), y: 12 });
  assert.equal(r.content.text.length, 200);
  assert.equal(r.content.badge.length, 10);
  assert.equal(r.centerY, 12);
});

test('parseTooltipRequest : sans pastille valide, null', () => {
  assert.equal(parseTooltipRequest({ text: 'a', badge: 5, y: 1 }).content.badge, null);
  assert.equal(parseTooltipRequest({ text: 'a', y: 1 }).content.badge, null);
});

test('parseTooltipRequest : une demande invalide est refusée', () => {
  for (const bad of [undefined, null, 'x', {}, { text: '', y: 1 }, { text: 3, y: 1 }, { text: 'a' }, { text: 'a', y: '1' }]) {
    assert.equal(parseTooltipRequest(bad), null, JSON.stringify(bad));
  }
});

// #endregion

// #region TooltipPopup

const toolbar = { x: 0, y: 100, width: 72, height: 800 };
const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

function tooltip(win, { existing = win } = {}) {
  return new TooltipPopup({ window: () => win, existingWindow: () => existing, toolbarBounds: () => toolbar, workArea: () => workArea, height: 40, stateChannel: 'tip' });
}

test('TooltipPopup : se place à droite de la barre, centrée sur le bouton, et s\'affiche', () => {
  const win = fakePopupWindow();
  tooltip(win).show({ text: 'Mail', y: 200 });
  assert.deepEqual(win.position, [80, 280]);
  assert.deepEqual(win.messages, [['tip', { text: 'Mail', badge: null }]]);
  assert.equal(win.visible, true);
});

test('TooltipPopup : reste dans la zone de travail', () => {
  const win = fakePopupWindow();
  tooltip(win).show({ text: 'Mail', y: 5000 });
  assert.equal(win.position[1], 1000);
});

test('TooltipPopup : une demande invalide ne fait rien', () => {
  const win = fakePopupWindow();
  tooltip(win).show({ text: '', y: 1 });
  assert.equal(win.visible, false);
  assert.deepEqual(win.messages, []);
});

test('TooltipPopup : hide masque la fenêtre visible, ignore l\'absente ou la détruite', () => {
  const win = fakePopupWindow();
  const popup = tooltip(win);
  popup.show({ text: 'a', y: 1 });
  popup.hide();
  assert.equal(win.visible, false);
  tooltip(win, { existing: undefined }).hide();
  win.visible = true;
  win.destroyed = true;
  popup.hide();
  assert.equal(win.visible, true, 'une fenêtre détruite n\'est pas touchée');
});

// #endregion

// #region MediaPopup

function scheduler() {
  const s = { pending: [], cleared: 0 };
  s.setTimeout = (fn, ms) => { const h = { fn, ms }; s.pending.push(h); return h; };
  s.clearTimeout = (h) => { s.cleared++; s.pending = s.pending.filter((p) => p !== h); };
  return s;
}

function mediaPopup({ payloads = {}, win = fakePopupWindow(), existing = win, sched = scheduler() } = {}) {
  const popup = new MediaPopup({
    window: () => win, existingWindow: () => existing, payloadFor: (url) => payloads[url] ?? null,
    toolbarBounds: () => toolbar, workArea: () => workArea, scheduler: sched, height: 100, hideDelayMs: 250, stateChannel: 'media',
  });
  return { popup, win, sched };
}

test('MediaPopup : le survol affiche l\'état du morceau à droite de la barre', () => {
  const { popup, win } = mediaPopup({ payloads: { u: { url: 'u', title: 'T' } } });
  popup.hover('u', true, 300);
  assert.deepEqual(win.position, [82, 350]);
  assert.deepEqual(win.messages, [['media', { url: 'u', title: 'T' }]]);
  assert.equal(win.visible, true);
  assert.equal(popup.hoverUrl, 'u');
});

test('MediaPopup : sans morceau, rien ne s\'affiche', () => {
  const { popup, win } = mediaPopup();
  popup.hover('u', true, 300);
  assert.equal(win.visible, false);
  assert.equal(popup.hoverUrl, null);
});

test('MediaPopup : un survol mal formé est ignoré', () => {
  const { popup, win } = mediaPopup({ payloads: { u: { url: 'u' } } });
  popup.hover(42, true, 300);
  popup.hover('u', true, '300');
  assert.equal(win.visible, false);
});

test('MediaPopup : un survol mal formé ne touche pas au masquage programmé', () => {
  const { popup, sched } = mediaPopup({ payloads: { u: { url: 'u' } } });
  popup.hover('u', true, 300);
  popup.hover('u', false);
  popup.hover(42, true, 300);
  assert.equal(sched.pending.length, 1, 'le masquage reste programmé');
});

test('MediaPopup : une fenêtre détruite ne provoque ni refresh ni hide', () => {
  const { popup, win } = mediaPopup({ payloads: { u: { url: 'u' } } });
  popup.hover('u', true, 300);
  win.destroyed = true;
  win.hide = () => { throw new Error('fenêtre détruite'); };
  popup.refresh('u');
  popup.hide();
  assert.equal(popup.hoverUrl, null);
});

test('MediaPopup : la sortie du pointeur masque après le délai, le retour annule', () => {
  const { popup, win, sched } = mediaPopup({ payloads: { u: { url: 'u' } } });
  popup.hover('u', true, 300);
  popup.hover('u', false);
  assert.equal(sched.pending.length, 1);
  assert.equal(sched.pending[0].ms, 250);
  popup.hover('u', true, 300);
  assert.equal(sched.pending.length, 0, 'le retour sur le bouton annule le masquage');
  popup.hover('u', false);
  sched.pending[0].fn();
  assert.equal(win.visible, false);
  assert.equal(popup.hoverUrl, null);
});

test('MediaPopup : refresh met à jour le popup affiché pour cette application', () => {
  const payloads = { u: { url: 'u', title: 'A' } };
  const { popup, win } = mediaPopup({ payloads });
  popup.hover('u', true, 300);
  payloads.u = { url: 'u', title: 'B' };
  popup.refresh('u');
  assert.deepEqual(win.messages.at(-1), ['media', { url: 'u', title: 'B' }]);
});

test('MediaPopup : refresh ignore une autre application ou un popup masqué', () => {
  const payloads = { u: { url: 'u' }, v: { url: 'v' } };
  const { popup, win } = mediaPopup({ payloads });
  popup.hover('u', true, 300);
  const count = win.messages.length;
  popup.refresh('v');
  assert.equal(win.messages.length, count);
  win.visible = false;
  popup.refresh('u');
  assert.equal(win.messages.length, count);
});

test('MediaPopup : refresh ferme le popup quand le morceau disparaît', () => {
  const payloads = { u: { url: 'u' } };
  const { popup, win } = mediaPopup({ payloads });
  popup.hover('u', true, 300);
  delete payloads.u;
  popup.refresh('u');
  assert.equal(win.visible, false);
  assert.equal(popup.hoverUrl, null);
});

test('MediaPopup : hide sans fenêtre ne plante pas', () => {
  const { popup } = mediaPopup({ existing: undefined });
  popup.hide();
  assert.equal(popup.hoverUrl, null);
});

// #endregion
