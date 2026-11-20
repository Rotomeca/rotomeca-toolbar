/**
 * Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes.
 *
 * Source unique, importée par le processus principal, le preload (qui en dérive sa liste blanche)
 * et les pages : un canal ajouté ici est immédiatement connu des trois, sans copie à synchroniser.
 * Chaque canal doit aussi avoir son contrat dans `contracts.ts` (une erreur de compilation le rappelle).
 *
 * Ce dossier est un module ES (voir `package.json`) : les pages l'importent nativement
 * et le processus principal, en CommonJS, le charge avec `require()`.
 */

/** Canaux que les pages appellent (`ipcRenderer.invoke` côté page, `ipcMain.handle` côté principal). */
export const appEventList = {
  toggleToolbar: 'toggleToolbar',
  requestAdd: 'requestAdd',
  requestAddData: 'requestAddData',
  requestAddSeparator: 'requestAddSeparator',
  requestAddDataEdit: 'requestAddDataEdit',
  requestUpdatedData: 'requestUpdatedData',
  closeFrame: 'closeFrame',
  openFrame: 'openFrame',
  closeApps: 'closeApps',
  appsContextMenu: 'appsContextMenu',
  appDelete: 'appDelete',
  appEdit: 'appEdit',
  timeoutStopTop: 'timeoutStopTop',
  toggleStopTop: 'toggleStopTop',
  requestMovement: 'requestMovement',
  killApp: 'killApp',
  refreshApp: 'refreshApp',
  minimiseWindow: 'minimiseWindow',
  settingsUpdated: 'setting.updated',
  getVersion: 'getVersion',
  isAppBarSupported: 'isAppBarSupported',
  getDisplays: 'getDisplays',
  toggleMute: 'toggleMute',
  mediaControl: 'mediaControl',
  mediaHover: 'mediaHover',
  rotomecaContextMenu: 'rotomeca-context-menu',
  edgeEnter: 'edgeEnter',
  requestToggle: 'requestToggle',
  openSettings: 'openSettings',
  tooltipShow: 'tooltipShow',
  tooltipHide: 'tooltipHide',
  getSavedUrls: 'getSavedUrls',
  getSeasonInfo: 'getSeasonInfo',
  updateGetState: 'updateGetState',
  updateCheck: 'updateCheck',
  updateInstall: 'updateInstall',
  permissionsList: 'permissionsList',
  permissionRevoke: 'permissionRevoke',
  permissionsClear: 'permissionsClear',
  updateCheckTest: 'updateCheckTest',
  updateInstallTest: 'updateInstallTest',
} as const;

/** Canaux que le processus principal envoie aux pages (`webContents.send` / `postMessage`). */
export const pageEventList = {
  toolbarClosed: 'toolbarClosed',
  modeEdit: 'mode_edit',
  frameOpen: 'frameOpen',
  toolbarAppSeparatorDelete: 'toolbarAppSeparatorDelete',
  toolbarAppDeleted: 'toolbarAppDeleted',
  windowAppMovement: 'windowAppMovement',
  appEdited: 'appEdited',
  appAdded: 'appAdded',
  appUpdated: 'appUpdated',
  init: 'init',
  appInserted: 'appInserted',
  windowAppsClosed: 'windowAppsClosed',
  settingsStart: 'settingsStart',
  appIndicators: 'appIndicators',
  mediaState: 'mediaState',
  tooltipState: 'tooltipState',
  updateState: 'updateState',
} as const;

/**
 * Canaux internes, hors liste blanche des pages : traductions demandées par le preload,
 * et état média échangé entre les sites, leur preload et le processus principal.
 */
export const internalChannels = {
  i18n: 'rtb-i18n',
  mediaState: 'rtb-media-state',
  mediaAction: 'rtb-media-action',
} as const;

/** Nom d'un canal que les pages peuvent appeler. */
export type InvokeChannel = (typeof appEventList)[keyof typeof appEventList];

/** Nom d'un canal que les pages peuvent écouter. */
export type PushChannel = (typeof pageEventList)[keyof typeof pageEventList];
