// Preload des vues de sites (sandboxé : seul `electron` est requirable).
// Un script est injecté dans le monde principal de la page, avant les siens,
// pour capturer les actions de l'API Media Session (previous/next/play/pause)
// et publier le morceau en cours. Le preload ne sert que de relais IPC.
// Bundlé par esbuild en un seul fichier (voir scripts/build.js).

import { ipcRenderer, webFrame } from 'electron';
import { internalChannels } from '../../shared/ipc/events.js';

// Noms des évènements DOM échangés entre le script injecté et ce preload : les mêmes
// que les canaux IPC correspondants.
const MEDIA_STATE_EVENT = internalChannels.mediaState;
const MEDIA_ACTION_EVENT = internalChannels.mediaAction;

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

  // setPositionState n'a pas de getter : on capture ce que la page déclare
  let declared = null;
  const originalPosition = ms.setPositionState.bind(ms);
  ms.setPositionState = (state) => {
    declared =
      state && state.duration
        ? {
            duration: state.duration,
            position: state.position || 0,
            rate: state.playbackRate || 1,
            at: performance.now(),
          }
        : null;
    return originalPosition(state);
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

  const progress = (playing) => {
    let duration = 0;
    let position = 0;

    if (declared) {
      duration = declared.duration;
      position =
        declared.position +
        (playing ? ((performance.now() - declared.at) / 1000) * declared.rate : 0);
    } else {
      const el = mediaElements().find(
        (x) => Number.isFinite(x.duration) && x.duration > 0 && !x.paused,
      );
      if (el) {
        duration = el.duration;
        position = el.currentTime;
      }
    }

    if (!(duration > 0)) return { duration: null, position: null };

    return {
      duration: Math.round(duration),
      position: Math.round(Math.min(Math.max(position, 0), duration)),
    };
  };

  let last = '';
  const publish = () => {
    const meta = ms.metadata;
    let state = null;

    if (meta && meta.title) {
      const playing =
        ms.playbackState === 'playing' ||
        (ms.playbackState === 'none' && mediaElements().some((x) => !x.paused));

      state = {
        ...progress(playing),
        title: meta.title,
        artist: meta.artist || meta.album || '',
        artwork: bestArtwork(meta.artwork),
        playing,
        actions: Object.keys(handlers),
      };
    }

    const json = JSON.stringify(state);
    if (json === last) return;
    last = json;
    window.dispatchEvent(new CustomEvent('${MEDIA_STATE_EVENT}', { detail: json }));
  };

  window.addEventListener('${MEDIA_ACTION_EVENT}', (event) => {
    const action = event.detail;
    if (handlers[action]) return handlers[action]({ action });

    // Pas de handler Media Session : on pilote directement les lecteurs
    const target = mediaElements().find((x) => !x.paused) || mediaElements()[0];
    if (action === 'pause') target?.pause();
    else if (action === 'play') target?.play();
  });

  setInterval(publish, 1000);
})();`;

webFrame.executeJavaScript(PAGE_SCRIPT).catch((error: unknown) => {
  console.warn('Injection du script média impossible', error);
});

window.addEventListener(MEDIA_STATE_EVENT, (event) => {
  ipcRenderer.send(internalChannels.mediaState, (event as CustomEvent<string>).detail);
});

ipcRenderer.on(internalChannels.mediaAction, (_event, action: unknown) => {
  window.dispatchEvent(new CustomEvent(MEDIA_ACTION_EVENT, { detail: action }));
});
