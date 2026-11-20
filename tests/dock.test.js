const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeLayout, dockRequest, dockRequestKey, isPointInside, stepAutoHide,
} = require('../dist/src/main/dock/dockGeometry.js');
const { AppBar } = require('../dist/src/main/dock/AppBar.js');
const { loadAppBarApi } = require('../dist/src/main/dock/appBarApi.js');
const { X11StrutBar } = require('../dist/src/main/dock/X11StrutBar.js');
const { loadX11Api, encodeCardinals, strutPartialValues, strutValues } = require('../dist/src/main/dock/x11Api.js');

// #region computeLayout

const sizes = { toolbarWidth: 80, addDialogWidth: 700, addDialogHeight: 600, edgeWidth: 4 };

/** Copie de l'ancien getter `AppMain.layout` : référence pour prouver que la disposition est identique. */
function referenceLayout({ workArea: wa, bounds, docked, dockedWidth, grantedArea, buttonMode }) {
  const toolbar = docked
    ? { ...(grantedArea ?? { x: bounds.x, y: wa.y, height: wa.height }), width: dockedWidth }
    : { x: wa.x + 10, y: wa.y + 10, width: sizes.toolbarWidth, height: wa.height - (buttonMode ? 52 : 20) };
  return {
    main: { x: wa.x + 10, y: wa.y + wa.height - 32, width: 64, height: 32 },
    toolbar,
    apps: {
      x: docked ? toolbar.x + toolbar.width + 10 : wa.x + 64 + 20,
      y: docked ? toolbar.y + 10 : wa.y + 10,
      width: Math.round(wa.width / 4),
      height: docked ? toolbar.height - 20 : toolbar.height,
    },
    addDialog: {
      x: toolbar.x + toolbar.width + 10,
      y: toolbar.y,
      width: Math.min(sizes.addDialogWidth, wa.width),
      height: Math.min(sizes.addDialogHeight, wa.height),
    },
    edge: { x: bounds.x, y: bounds.y, width: sizes.edgeWidth, height: bounds.height },
  };
}

test('computeLayout : même disposition que l\'ancien calcul, pour tous les modes et écrans', () => {
  const screens = [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
    { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: -200, width: 1280, height: 720 }, workArea: { x: 1920, y: -160, width: 1280, height: 680 } },
    { bounds: { x: 0, y: 0, width: 500, height: 400 }, workArea: { x: 0, y: 40, width: 500, height: 360 } },
  ];
  let compared = 0;
  for (const { bounds, workArea } of screens) {
    for (const docked of [true, false]) {
      for (const buttonMode of [true, false]) {
        for (const dockedWidth of [24, 80]) {
          for (const grantedArea of [null, { x: bounds.x, y: workArea.y + 5, width: 24, height: workArea.height - 5 }]) {
            const input = { workArea, bounds, sizes, docked, dockedWidth, grantedArea, buttonMode };
            assert.deepEqual(computeLayout(input), referenceLayout(input), JSON.stringify(input));
            ++compared;
          }
        }
      }
    }
  }
  assert.equal(compared, 64);
});

test('computeLayout : la barre ancrée prend la largeur courante, même si le système en a accordé une autre', () => {
  const layout = computeLayout({
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    sizes, docked: true, dockedWidth: 24, buttonMode: false,
    grantedArea: { x: 0, y: 0, width: 80, height: 800 },
  });
  assert.equal(layout.toolbar.width, 24);
  assert.equal(layout.apps.x, 24 + 10);
});

// #endregion

// #region dockRequest

const bounds = { x: 10, y: 20, width: 1920, height: 1080 };

test('dockRequest : barre dépliée, la largeur courante est réservée', () => {
  assert.deepEqual(dockRequest({ bounds, autoHide: false, dockedWidth: 80, railWidth: 24 }), { x: 10, y: 20, width: 80, height: 1080 });
});

test('dockRequest : en masquage automatique, seul le rail réserve de la place', () => {
  assert.equal(dockRequest({ bounds, autoHide: true, dockedWidth: 80, railWidth: 24 }).width, 24);
});

test('dockRequestKey : identique pour la même demande, différente sinon', () => {
  const a = dockRequest({ bounds, autoHide: false, dockedWidth: 80, railWidth: 24 });
  assert.equal(dockRequestKey(a), dockRequestKey({ ...a }));
  assert.notEqual(dockRequestKey(a), dockRequestKey({ ...a, width: 24 }));
});

// #endregion

// #region isPointInside / stepAutoHide

test('isPointInside : bords haut/gauche inclus, bas/droite exclus, plusieurs rectangles', () => {
  const rects = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 100, width: 5, height: 5 }];
  assert.equal(isPointInside({ x: 0, y: 0 }, rects), true);
  assert.equal(isPointInside({ x: 9, y: 9 }, rects), true);
  assert.equal(isPointInside({ x: 10, y: 5 }, rects), false);
  assert.equal(isPointInside({ x: 102, y: 102 }, rects), true);
  assert.equal(isPointInside({ x: 50, y: 50 }, rects), false);
  assert.equal(isPointInside({ x: 0, y: 0 }, []), false);
});

test('stepAutoHide : dedans, le minuteur repart de zéro', () => {
  assert.deepEqual(stepAutoHide(500, true, 1000, 700), { outsideSince: null, collapse: false });
});

test('stepAutoHide : première sortie, le minuteur démarre', () => {
  assert.deepEqual(stepAutoHide(null, false, 1000, 700), { outsideSince: 1000, collapse: false });
});

test('stepAutoHide : dehors depuis moins que le délai, on attend', () => {
  assert.deepEqual(stepAutoHide(1000, false, 1699, 700), { outsideSince: 1000, collapse: false });
});

test('stepAutoHide : dehors depuis le délai, la barre se replie', () => {
  assert.deepEqual(stepAutoHide(1000, false, 1700, 700), { outsideSince: null, collapse: true });
});

// #endregion

// #region AppBar

function fakeApi({ acceptNew = true, grantedLeft = 0 } = {}) {
  const calls = [];
  return {
    calls,
    size: 40,
    registerMessage: (name) => { calls.push(['register', name]); return 0x8001; },
    shAppBarMessage: (message, data) => {
      calls.push(['msg', message, { ...data, rc: { ...data.rc } }]);
      if (message === 0 && !acceptNew) return 0;
      if (message === 2) { data.rc.left = grantedLeft; data.rc.right = grantedLeft + 999; }
      return 1;
    },
  };
}

function fakeWindow() {
  const handlers = new Map();
  const win = {
    destroyed: false,
    isDestroyed: () => win.destroyed,
    getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(123n, 0); return b; },
    hookWindowMessage: (message, callback) => handlers.set(message, callback),
    unhookWindowMessage: (message) => handlers.delete(message),
    handlers,
  };
  return win;
}

const converter = {
  dipToScreenRect: (_, r) => ({ x: r.x * 2, y: r.y * 2, width: r.width * 2, height: r.height * 2 }),
  screenToDipRect: (_, r) => ({ x: r.x / 2, y: r.y / 2, width: r.width / 2, height: r.height / 2 }),
};

test('AppBar : sans API native, rien n\'est possible', () => {
  const bar = new AppBar(null, converter);
  assert.equal(bar.register(fakeWindow()), false);
  assert.equal(bar.setPos({ x: 0, y: 0, width: 1, height: 1 }), null);
  assert.equal(bar.registered, false);
  bar.unregister();
});

test('AppBar : register enregistre la fenêtre auprès du système', () => {
  const api = fakeApi();
  const win = fakeWindow();
  const bar = new AppBar(api, converter);
  assert.equal(bar.register(win), true);
  assert.equal(bar.registered, true);
  assert.deepEqual(api.calls[0], ['register', 'RotomecaToolbarAppBar']);
  const [, message, data] = api.calls[1];
  assert.equal(message, 0);
  assert.equal(data.hWnd, 123n);
  assert.equal(data.cbSize, 40);
  assert.equal(data.uCallbackMessage, 0x8001);
  assert.ok(win.handlers.has(0x8001));
  assert.equal(bar.register(win), true, 'déjà enregistrée');
  assert.equal(api.calls.length, 2);
});

test('AppBar : refus du système, la barre n\'est pas enregistrée', () => {
  const bar = new AppBar(fakeApi({ acceptNew: false }), converter);
  assert.equal(bar.register(fakeWindow()), false);
  assert.equal(bar.registered, false);
});

test('AppBar : une fenêtre détruite ne s\'enregistre pas', () => {
  const win = fakeWindow();
  win.destroyed = true;
  assert.equal(new AppBar(fakeApi(), converter).register(win), false);
});

test('AppBar : setPos demande la zone en pixels physiques et rend celle accordée en DIP', () => {
  const api = fakeApi({ grantedLeft: 60 });
  const bar = new AppBar(api, converter);
  bar.register(fakeWindow());
  const granted = bar.setPos({ x: 0, y: 10, width: 40, height: 500 });
  const [query, set] = api.calls.slice(-2);
  assert.equal(query[1], 2);
  assert.deepEqual(query[2].rc, { left: 0, top: 20, right: 80, bottom: 1020 });
  assert.equal(set[1], 3);
  // La largeur demandée (80 px) est conservée, collée à la position accordée par le système
  assert.deepEqual(set[2].rc, { left: 60, top: 20, right: 140, bottom: 1020 });
  assert.deepEqual(granted, { x: 30, y: 10, width: 40, height: 500 });
});

test('AppBar : setPos avant register ne fait rien', () => {
  assert.equal(new AppBar(fakeApi(), converter).setPos({ x: 0, y: 0, width: 1, height: 1 }), null);
});

test('AppBar : les notifications du système appellent les rappels', () => {
  const events = [];
  const win = fakeWindow();
  const bar = new AppBar(fakeApi(), converter, {
    onFullscreen: (value) => events.push(['plein écran', value]),
    onPosChanged: () => events.push(['position']),
  });
  bar.register(win);
  const hook = win.handlers.get(0x8001);
  const word = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
  hook(word(2), word(1));
  hook(word(2), word(0));
  hook(word(1), word(0));
  hook(word(9), word(0));
  assert.deepEqual(events, [['plein écran', true], ['plein écran', false], ['position']]);
});

test('AppBar : unregister libère l\'espace et décroche le message, une seule fois', () => {
  const api = fakeApi();
  const win = fakeWindow();
  const bar = new AppBar(api, converter);
  bar.register(win);
  bar.unregister();
  assert.equal(bar.registered, false);
  assert.equal(win.handlers.size, 0);
  assert.equal(api.calls.at(-1)[1], 1);
  const count = api.calls.length;
  bar.unregister();
  assert.equal(api.calls.length, count);
});

test('AppBar : unregister avec une fenêtre détruite ne rappelle pas le système', () => {
  const api = fakeApi();
  const win = fakeWindow();
  const bar = new AppBar(api, converter);
  bar.register(win);
  const count = api.calls.length;
  win.destroyed = true;
  bar.unregister();
  assert.equal(api.calls.length, count);
  assert.equal(bar.registered, false);
});

// #endregion

// #region loadAppBarApi

test('loadAppBarApi : hors Windows, aucune API et koffi n\'est pas chargé', () => {
  const loader = () => { throw new Error('ne doit pas être appelé'); };
  assert.equal(loadAppBarApi('linux', loader), null);
  assert.equal(loadAppBarApi('darwin', loader), null);
});

test('loadAppBarApi : si koffi ne se charge pas, aucune API', (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(loadAppBarApi('win32', () => { throw new Error('koffi absent'); }), null);
});

test('loadAppBarApi : décrit les structures et les fonctions natives attendues', () => {
  const declared = [];
  const lib = (name) => ({ func: (signature) => { declared.push([name, signature]); return () => 1; } });
  const koffi = {
    struct: (name) => ({ name }),
    sizeof: (type) => (type.name === 'APPBARDATA' ? 48 : 0),
    load: lib,
  };
  const api = loadAppBarApi('win32', () => koffi);
  assert.equal(api.size, 48);
  assert.deepEqual(declared.map(([dll]) => dll), ['shell32.dll', 'user32.dll']);
  assert.match(declared[0][1], /SHAppBarMessage/);
  assert.match(declared[1][1], /RegisterWindowMessageW/);
});

// #endregion

// #region X11StrutBar

/** Fenêtre factice dont l'identifiant X11 est 0x2a. */
function fakeX11Window() {
  const handle = Buffer.alloc(8);
  handle.writeUInt32LE(0x2a, 0);
  return { destroyed: false, isDestroyed() { return this.destroyed; }, getNativeWindowHandle: () => handle };
}

/** API X11 factice qui enregistre les appels. */
function fakeX11Api() {
  const calls = [];
  return {
    calls,
    setStrut: (windowId, strut) => calls.push(['set', windowId, strut]),
    clearStrut: (windowId) => calls.push(['clear', windowId]),
  };
}

/** Conversion factice : densité x2. */
const x2 = {
  dipToScreenRect: (_w, r) => ({ x: r.x * 2, y: r.y * 2, width: r.width * 2, height: r.height * 2 }),
  screenToDipRect: (_w, r) => r,
};

test('X11StrutBar : setPos réserve la bande en pixels physiques et rend la zone demandée', () => {
  const api = fakeX11Api();
  const bar = new X11StrutBar(api, x2);
  assert.equal(bar.register(fakeX11Window()), true);

  const granted = bar.setPos({ x: 0, y: 10, width: 40, height: 500 });
  assert.deepEqual(granted, { x: 0, y: 10, width: 40, height: 500 });
  assert.deepEqual(api.calls, [['set', 0x2a, { width: 80, startY: 20, endY: 1019 }]]);
});

test('X11StrutBar : setPos sans enregistrement ne fait rien', () => {
  const api = fakeX11Api();
  const bar = new X11StrutBar(api, x2);
  assert.equal(bar.setPos({ x: 0, y: 0, width: 40, height: 100 }), null);
  assert.equal(api.calls.length, 0);
});

test('X11StrutBar : une fenêtre détruite ne s\'enregistre pas', () => {
  const win = fakeX11Window();
  win.destroyed = true;
  const bar = new X11StrutBar(fakeX11Api(), x2);
  assert.equal(bar.register(win), false);
  assert.equal(bar.registered, false);
});

test('X11StrutBar : unregister libère la bande, et seulement si la fenêtre existe', () => {
  const api = fakeX11Api();
  const bar = new X11StrutBar(api, x2);
  const win = fakeX11Window();
  bar.register(win);
  bar.unregister();
  assert.deepEqual(api.calls, [['clear', 0x2a]]);
  assert.equal(bar.registered, false);

  bar.register(win);
  win.destroyed = true;
  bar.unregister();
  assert.equal(api.calls.length, 1);
});

// #endregion

// #region loadX11Api

test('loadX11Api : hors Linux, sans DISPLAY ou sous Wayland, aucune API et koffi n\'est pas chargé', () => {
  const loader = () => { throw new Error('ne doit pas être appelé'); };
  assert.equal(loadX11Api('win32', { DISPLAY: ':0' }, loader), null);
  assert.equal(loadX11Api('linux', {}, loader), null);
  assert.equal(loadX11Api('linux', { DISPLAY: ':0', XDG_SESSION_TYPE: 'wayland' }, loader), null);
});

test('loadX11Api : si koffi ne se charge pas, aucune API', (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(loadX11Api('linux', { DISPLAY: ':0' }, () => { throw new Error('koffi absent'); }), null);
});

test('loadX11Api : pas d\'affichage X11 joignable, aucune API', () => {
  const lib = { func: (signature) => (signature.includes('XOpenDisplay') ? () => null : () => 0) };
  assert.equal(loadX11Api('linux', { DISPLAY: ':0' }, () => ({ load: () => lib, sizeof: () => 8 })), null);
});

test('loadX11Api : pose les deux propriétés puis les retire', () => {
  const calls = [];
  const lib = {
    func: (signature) => {
      const name = /(X\w+)\(/.exec(signature)[1];
      return (...args) => {
        calls.push([name, ...args]);
        if (name === 'XOpenDisplay') return {};
        if (name === 'XInternAtom') return args[1] === '_NET_WM_STRUT_PARTIAL' ? 100 : 101;
        return 0;
      };
    },
  };
  const api = loadX11Api('linux', { DISPLAY: ':0' }, () => ({ load: () => lib, sizeof: () => 8 }));
  api.setStrut(42, { width: 80, startY: 0, endY: 99 });

  const changes = calls.filter(([name]) => name === 'XChangeProperty');
  assert.deepEqual(changes.map((c) => [c[2], c[3], c[4], c[5], c[6], c[8]]), [[42, 100, 6, 32, 0, 12], [42, 101, 6, 32, 0, 4]]);
  assert.equal(changes[0][7].readBigUInt64LE(0), 80n);

  api.clearStrut(42);
  assert.deepEqual(calls.filter(([name]) => name === 'XDeleteProperty').map((c) => [c[2], c[3]]), [[42, 100], [42, 101]]);
});

test('encodeCardinals / strutPartialValues : un long par valeur, bande au bord gauche', () => {
  assert.equal(encodeCardinals([1, 2], 8).length, 16);
  assert.equal(encodeCardinals([1, 2], 4).readUInt32LE(4), 2);
  assert.deepEqual(strutPartialValues({ width: 80, startY: 5, endY: 99 }), [80, 0, 0, 0, 5, 99, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(strutValues({ width: 80, startY: 5, endY: 99 }), [80, 0, 0, 0]);
});

// #endregion
