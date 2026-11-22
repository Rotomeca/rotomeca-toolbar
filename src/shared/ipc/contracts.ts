/**
 * Contrat typé de chaque canal IPC : arguments et réponse d'un appel, arguments d'un envoi.
 *
 * Utilisé par `src/types/window-api.d.ts` pour typer `window.api` côté pages. Les noms de canaux
 * viennent de `events.ts` ; une garde de compilation en bas de fichier vérifie qu'aucun canal ne manque.
 * Les valeurs reçues par le processus principal restent non fiables et sont revalidées à l'arrivée.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type {
  AppDto,
  AskablePermission,
  DisplayInfo,
  IndicatorsDto,
  MediaAction,
  MediaPayload,
  PermissionDecision,
  SeasonInfo,
  ToolbarEntryDto,
  UpdateState,
} from '../dto.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import type { InvokeChannel, PushChannel } from './events.js';

/** Réglages envoyés par la page des paramètres. */
export interface SettingsFormDto {
  /** Nom du thème choisi à la main. */
  readonly theme: string;
  /** Thème automatique selon la saison. */
  readonly themeAuto: boolean;
  /** Effets de saison activés. */
  readonly effetsSaison: boolean;
  /** Moments de la journée et météo (thème automatique seulement). */
  readonly momentsMeteo: boolean;
  /** Densité des effets de saison. */
  readonly densiteEffets: string;
  /** Mode bouton (la barre s'ouvre depuis un bouton). */
  readonly isButtonModeEnabled: boolean;
  /** Barre ancrée au bord de l'écran. */
  readonly appBarEnabled: boolean;
  /** Barre ancrée qui se replie quand la souris la quitte. */
  readonly appBarAutoHide: boolean;
  /** Écran choisi, `null` pour l'écran principal. */
  readonly displayId: number | null;
}

/** Application à modifier, ouverte dans la fenêtre d'édition. */
export interface EditRequestDto {
  /** Adresse actuelle de l'application. */
  readonly url: string;
  /** Titre de la page du site, proposé comme nom. */
  readonly title?: string;
  /** Nom actuel de l'application. */
  readonly name?: string;
  /** Icône actuelle. */
  readonly picture?: string | null;
  /** Position de l'application dans la barre. */
  readonly index: number;
}

/** Ce que la page envoie quand l'utilisateur clique avec le bouton droit. */
export interface ContextMenuClickDto {
  /** Élément cliqué. */
  readonly target: {
    /** Contenu texte de l'élément. */
    readonly content: string;
    /** Nom de la balise. */
    readonly nodeName: string;
    /** Attributs de l'élément. */
    readonly attribs: Readonly<Record<string, string>>;
    /** Classes CSS de l'élément. */
    readonly classes: readonly string[];
  };
  /** Bouton de la souris (2 pour le clic droit). */
  readonly button: number;
  /** Abscisse du clic dans la page. */
  readonly x: number;
  /** Ordonnée du clic dans la page. */
  readonly y: number;
}

/** Un appel d'une page vers le processus principal : arguments et réponse, par canal. */
export interface InvokeContracts {
  toggleToolbar: { args: []; result: void };
  requestAdd: { args: []; result: void };
  requestAddData: { args: [app: Partial<AppDto>]; result: boolean };
  requestAddSeparator: { args: [url: string]; result: void };
  requestAddDataEdit: { args: [app: Partial<AppDto>]; result: void };
  requestUpdatedData: { args: [app: Partial<AppDto> & { id: number }]; result: void };
  closeFrame: { args: [url: string]; result: void };
  openFrame: { args: [url: string]; result: void };
  closeApps: { args: []; result: void };
  getFavicon: { args: [url: string]; result: string | null };
  appsContextMenu: { args: []; result: void };
  appDelete: { args: [url: string]; result: void };
  appEdit: { args: [app: Partial<EditRequestDto> & { url: string }]; result: void };
  timeoutStopTop: { args: []; result: void };
  toggleStopTop: { args: []; result: void };
  requestMovement: { args: [movement: { url: string; type: 'up' | 'down' }]; result: void };
  killApp: { args: [url: string, open?: boolean]; result: void };
  refreshApp: { args: [url: string]; result: void };
  minimiseWindow: { args: [window: 'add']; result: void };
  'setting.updated': { args: [settings: SettingsFormDto]; result: void };
  getVersion: { args: []; result: string };
  isAppBarSupported: { args: []; result: boolean };
  getDisplays: { args: []; result: DisplayInfo[] };
  toggleMute: { args: [target: { url: string }]; result: void };
  mediaControl: { args: [command: { url: string; action: MediaAction }]; result: void };
  /** `y` (milieu du bouton dans la barre) n'est donné que par la barre, à l'entrée du pointeur. */
  mediaHover: { args: [hover: { url: string; hovering: boolean; y?: number }]; result: void };
  'rotomeca-context-menu': { args: [click: ContextMenuClickDto]; result: void };
  edgeEnter: { args: []; result: void };
  requestToggle: { args: []; result: void };
  openSettings: { args: []; result: void };
  tooltipShow: { args: [tooltip: { text: string; badge: string | null; y: number }]; result: void };
  tooltipHide: { args: []; result: void };
  getSavedUrls: { args: []; result: string[] };
  getSeasonInfo: { args: []; result: SeasonInfo };
  updateGetState: { args: []; result: UpdateState };
  updateCheck: { args: []; result: void };
  updateInstall: { args: []; result: void };
  permissionsList: { args: []; result: PermissionDecision[] };
  permissionRevoke: { args: [decision: { origin: string; permission: AskablePermission }]; result: PermissionDecision[] };
  permissionsClear: { args: []; result: PermissionDecision[] };
  updateCheckTest: { args: []; result: void };
  updateInstallTest: { args: []; result: void };
}

/** Un envoi du processus principal vers les pages : les arguments reçus par l'écouteur, par canal. */
export interface PushContracts {
  // Le nom du champ est la valeur du canal (par exemple `mode_edit`), pas la clé de `pageEventList`
  toolbarClosed: [opened: true];
  mode_edit: [app: EditRequestDto];
  frameOpen: [url: string | null];
  toolbarAppSeparatorDelete: [reference: string | number | undefined];
  toolbarAppDeleted: [url: string];
  windowAppMovement: [movement: { url: string; type: 'up' | 'down'; modifier: number }];
  appEdited: [editing: boolean];
  appAdded: [entry: ToolbarEntryDto];
  appUpdated: [update: AppDto & { id: number; oldLink: string }];
  init: [start: { saves: ToolbarEntryDto[]; settings: { isButton: boolean } }];
  appInserted: [insertion: { url: string; index: number; data: 'separator' }];
  windowAppsClosed: [closed: true];
  settingsStart: [settingsFile: string];
  appIndicators: [indicators: IndicatorsDto];
  mediaState: [media: MediaPayload];
  tooltipState: [tooltip: { text: string; badge: string | null }];
  updateState: [state: UpdateState];
}

/** Arguments d'un appel vers le processus principal. */
export type InvokeArgs<C extends InvokeChannel> = InvokeContracts[C]['args'];

/** Réponse d'un appel vers le processus principal. */
export type InvokeResult<C extends InvokeChannel> = InvokeContracts[C]['result'];

/** Arguments reçus par l'écouteur d'un canal envoyé par le processus principal. */
export type PushArgs<C extends PushChannel> = PushContracts[C];

/** Vrai si les deux types sont identiques. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Ne compile que si le type reçu est `true`. */
type Assert<T extends true> = T;
/** Garde de compilation : les contrats d'appel couvrent exactement les canaux de `appEventList`, ni plus, ni moins. */
export type InvokeContractsCoverChannels = Assert<Same<InvokeChannel, keyof InvokeContracts>>;
/** Garde de compilation : les contrats d'envoi couvrent exactement les canaux de `pageEventList`. */
export type PushContractsCoverChannels = Assert<Same<PushChannel, keyof PushContracts>>;
