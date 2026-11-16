const { contextBridge, ipcRenderer } = require('electron');

// Un preload sandboxé ne peut pas `require` de fichier local : les listes
// ci-dessous doivent rester synchronisées avec
// `src/scripts/events/AppEventList.js` et `PageEventList.js`.

/** Canaux `ipcMain.handle` autorisés pour le renderer */
const INVOKE_CHANNELS = new Set([
  'toggleToolbar',
  'requestAdd',
  'requestAddData',
  'requestAddSeparator',
  'requestAddDataEdit',
  'requestUpdatedData',
  'closeFrame',
  'openFrame',
  'closeApps',
  'appDelete',
  'appEdit',
  'timeoutStopTop',
  'toggleStopTop',
  'requestMovement',
  'killApp',
  'refreshApp',
  'minimiseWindow',
  'setting.updated',
  'getVersion',
  'rotomeca-context-menu',
]);

/** Canaux envoyés par le process principal vers le renderer */
const ON_CHANNELS = new Set([
  'toolbarClosed',
  'mode_edit',
  'frameOpen',
  'toolbarAppSeparatorDelete',
  'toolbarAppDeleted',
  'windowAppMovement',
  'appEdited',
  'appAdded',
  'appUpdated',
  'init',
  'appInserted',
  'windowAppsClosed',
  'settingsStart',
]);

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...data) => {
    if (INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...data);
    }
  },
  /**
   * Écoute un canal autorisé. Le premier argument du callback (l'évènement IPC)
   * n'est jamais transmis à la page.
   * @returns {() => void} Fonction de désabonnement
   */
  on: (channel, callback) => {
    if (!ON_CHANNELS.has(channel) || typeof callback !== 'function')
      return () => {};

    const listener = (_event, ...args) => callback(null, ...args);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  },
});
