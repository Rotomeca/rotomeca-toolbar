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
import type { InvokeChannel, PushChannel } from './events.js';

/** Réglages envoyés par la page des paramètres. */
export interface SettingsFormDto {
  readonly theme: string;
  readonly themeAuto: boolean;
  readonly effetsSaison: boolean;
  readonly densiteEffets: string;
  readonly isButtonModeEnabled: boolean;
  readonly appBarEnabled: boolean;
  readonly appBarAutoHide: boolean;
  readonly displayId: number | null;
}

/** Application à modifier, ouverte dans la fenêtre d'édition. */
export interface EditRequestDto {
  readonly url: string;
  readonly title?: string;
  readonly name?: string;
  readonly picture?: string | null;
  /** Position de l'application dans la barre. */
  readonly index: number;
}

/** Ce que la page envoie quand l'utilisateur clique avec le bouton droit. */
export interface ContextMenuClickDto {
  readonly target: {
    readonly content: string;
    readonly nodeName: string;
    readonly attribs: Readonly<Record<string, string>>;
    readonly classes: readonly string[];
  };
  readonly button: number;
  readonly x: number;
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
  mediaHover: { args: [hover: { url: string; hovering: boolean; y: number }]; result: void };
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

// Garde de compilation : les contrats couvrent exactement les canaux de `events.ts`, ni plus, ni moins
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type InvokeContractsCoverChannels = Assert<Same<InvokeChannel, keyof InvokeContracts>>;
export type PushContractsCoverChannels = Assert<Same<PushChannel, keyof PushContracts>>;
