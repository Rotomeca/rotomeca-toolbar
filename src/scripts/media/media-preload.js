// Preload des vues de sites (sandboxé : seul `electron` est requirable).
// Un script est injecté dans le monde principal de la page, avant les siens,
// pour capturer les actions de l'API Media Session (previous/next/play/pause)
// et publier le morceau en cours. Le preload ne sert que de relais IPC.
const { ipcRenderer, webFrame } = require('electron');

const PAGE_SCRIPT = `(() => {
  const ms = navigator.mediaSession;
  if (!ms) return;

  const handlers = {};
  const original = ms.setActionHandler.bind(ms);
  ms.setActionHandler = (action, handler) => {
    if (typeof handler === 'function') handlers[action] = handler;
    else delete handlers[action];
    return original(action, handler);
  };

  const mediaElements = () => [...document.querySelectorAll('audio, video')];

  const bestArtwork = (list) => {
    let best = null;
    let bestSize = -1;
    for (const item of list || []) {
      const size = parseInt(String(item.sizes || '').split('x')[0], 10) || 0;
      if (size > bestSize) {
        best = item;
        bestSize = size;
      }
    }
    try {
      return best ? new URL(best.src, location.href).href : null;
    } catch (e) {
      return null;
    }
  };

  let last = '';
  const publish = () => {
    const meta = ms.metadata;
    let state = null;

    if (meta && meta.title) {
      state = {
        title: meta.title,
        artist: meta.artist || meta.album || '',
        artwork: bestArtwork(meta.artwork),
        playing:
          ms.playbackState === 'playing' ||
          (ms.playbackState === 'none' && mediaElements().some((x) => !x.paused)),
        actions: Object.keys(handlers),
      };
    }

    const json = JSON.stringify(state);
    if (json === last) return;
    last = json;
    window.dispatchEvent(new CustomEvent('rtb-media-state', { detail: json }));
  };

  window.addEventListener('rtb-media-action', (event) => {
    const action = event.detail;
    if (handlers[action]) return handlers[action]({ action });

    // Pas de handler Media Session : on pilote directement les lecteurs
    const target = mediaElements().find((x) => !x.paused) || mediaElements()[0];
    if (action === 'pause') target?.pause();
    else if (action === 'play') target?.play();
  });

  setInterval(publish, 1000);
})();`;

webFrame.executeJavaScript(PAGE_SCRIPT).catch(() => {});

window.addEventListener('rtb-media-state', event => {
	ipcRenderer.send('rtb-media-state', event.detail);
});

ipcRenderer.on('rtb-media-action', (_event, action) => {
	window.dispatchEvent(new CustomEvent('rtb-media-action', { detail: action }));
});
