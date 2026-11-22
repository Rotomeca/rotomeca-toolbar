/**
 * Qui peut appeler quoi : pour chaque canal IPC des pages, les seules fenêtres autorisées à l'appeler.
 *
 * Utilisé par `IpcRouter` en plus du contrôle d'origine (`trustedSender`). Une page de l'application ne reçoit
 * ainsi que les pouvoirs dont elle a besoin : la page du lecteur média, qui affiche des titres venus de sites
 * tiers, ne peut ni installer une mise à jour ni effacer les permissions, même si elle était un jour détournée.
 */
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList } from '../../shared/ipc/events.js';

/** Fenêtre (donc page) d'où vient un appel : celles de `AppWindows`, plus la fenêtre du menu contextuel. */
export type PageName =
  | 'main'
  | 'toolbar'
  | 'media'
  | 'tooltip'
  | 'add_dialog'
  | 'edge'
  | 'apps'
  | 'settings'
  | 'contextmenu';

/** Canaux soumis à cette table : tous ceux des pages, sauf le menu contextuel qui contrôle son appelant lui-même. */
type RestrictedChannel = Exclude<keyof typeof appEventList, 'rotomecaContextMenu'>;

/**
 * Pages autorisées pour chaque canal (clé = nom dans `appEventList`). Chaque entrée correspond aux appels
 * réellement faits par les pages (`src/page.*`, `src/index`, `HTMLToolbarButton`) : un canal ajouté dans
 * `events.ts` doit apparaître ici, un test le vérifie.
 */
const CALLERS: Readonly<Record<RestrictedChannel, readonly PageName[]>> = {
  toggleToolbar: ['main', 'toolbar'],
  requestAdd: ['toolbar'],
  requestAddData: ['add_dialog'],
  requestAddSeparator: ['contextmenu'],
  requestAddDataEdit: ['add_dialog'],
  requestUpdatedData: ['add_dialog'],
  closeFrame: ['toolbar'],
  openFrame: ['toolbar'],
  closeApps: ['apps'],
  getFavicon: ['toolbar'],
  appsContextMenu: ['apps'],
  appDelete: ['contextmenu'],
  appEdit: ['contextmenu'],
  timeoutStopTop: ['main'],
  toggleStopTop: ['main'],
  requestMovement: ['contextmenu'],
  killApp: ['apps'],
  refreshApp: ['apps'],
  minimiseWindow: ['add_dialog'],
  settingsUpdated: ['settings'],
  getVersion: ['settings'],
  isAppBarSupported: ['settings'],
  getDisplays: ['settings'],
  toggleMute: ['contextmenu', 'media'],
  mediaControl: ['media'],
  mediaHover: ['media', 'toolbar'],
  edgeEnter: ['edge', 'toolbar'],
  requestToggle: ['toolbar'],
  openSettings: ['toolbar'],
  tooltipShow: ['toolbar'],
  tooltipHide: ['toolbar'],
  getSavedUrls: ['add_dialog'],
  getSeasonInfo: ['settings'],
  updateGetState: ['settings', 'toolbar'],
  updateCheck: ['settings'],
  updateInstall: ['settings'],
  permissionsList: ['settings'],
  permissionRevoke: ['settings'],
  permissionsClear: ['settings'],
  updateCheckTest: ['settings'],
  updateInstallTest: ['settings'],
};

/** Canal (valeur envoyée sur le fil) → pages autorisées. Plusieurs noms peuvent différer de leur valeur (`setting.updated`). */
const CALLERS_BY_CHANNEL: ReadonlyMap<string, readonly PageName[]> = new Map(
  (Object.keys(CALLERS) as RestrictedChannel[]).map((name) => [appEventList[name], CALLERS[name]]),
);

/**
 * @param channel Canal IPC appelé (valeur envoyée sur le fil)
 * @returns Les pages autorisées à l'appeler, `undefined` si le canal n'est pas dans la table
 */
export function pagesAllowedFor(channel: string): readonly PageName[] | undefined {
  return CALLERS_BY_CHANNEL.get(channel);
}

/**
 * @param channel Canal IPC appelé
 * @param page Fenêtre d'où vient l'appel, `undefined` si elle n'est pas reconnue
 * @returns `true` si cette page peut appeler ce canal ; un canal absent de la table est refusé
 */
export function isChannelAllowed(channel: string, page: PageName | undefined): boolean {
  return page !== undefined && (pagesAllowedFor(channel)?.includes(page) ?? false);
}

/** @returns Les canaux (valeurs envoyées sur le fil) que la table connaît, pour vérifier qu'elle couvre `events.ts` */
export function restrictedChannels(): string[] {
  return [...CALLERS_BY_CHANNEL.keys()];
}
