/**
 * Assemblage du processus principal : crée les services de la barre et route les appels des pages.
 *
 * Créé et démarré par `bootstrap.ts`. Ce fichier ne contient presque aucune logique métier : chaque
 * comportement vit dans un service testable (injection de dépendances) et `App` ne fait que câbler
 * les services entre eux et avec Electron (écrans, fenêtres, dialogues, minuteurs).
 *
 * Qui fait quoi :
 * - `AppWindows` : crée et retient les fenêtres (barre, bouton, applications, ajout, paramètres, médias, infobulle).
 * - `ToolbarController` : état et géométrie de la barre (ouverture, masquage, survol du bord, barre ancrée).
 * - `ThemeService` : thème clair/sombre/saison, appliqué aux pages et rediffusé quand les paramètres changent.
 * - `AppViewHost` : vues web des sites lancés (ouverture, cache, son coupé, badges, contrôle des médias).
 * - `AppListService` : liste des applications de la barre, sauvegardée sur disque (`JsonFileStore`).
 * - `FaviconService` : icônes des sites, cherchées dans leur page et gardées sur disque.
 * - `MediaPopup` et `TooltipPopup` : petites fenêtres flottantes (morceau en cours, infobulle d'un bouton).
 * - `ContextMenuController` : menu contextuel (clic droit) des boutons de la barre.
 * - Zone de notification (`createElectronTray`) : icône, menu, infobulle du morceau et badge de mise à jour.
 * - `IpcRouter` : enregistre les appels des pages (`appEventList`) et valide leurs arguments avant de déléguer.
 * - `UpdateManager` et `PermissionStore` : fournis par `bootstrap.ts` (mises à jour, permissions des sites).
 *
 * Routage IPC : toute page appelle le processus principal via un canal de `shared/ipc/events.ts` ;
 * `registerIpcRoutes` associe chaque canal à une méthode d'un service. Les arguments venant des pages
 * sont non fiables (`unknown`) et vérifiés ici. Les envois inverses passent par `pageEventList`.
 */
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { WebContentsView, app, dialog, ipcMain, net, screen, session, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
// [AppIndicators.ts] Indicateurs d'une application : nombre de non-lus du titre et état média validé
import { sanitizeMediaState } from '../scripts/AppIndicators.js';
// [appIcon.ts] Choisit l'icône de l'application selon que la version est une pré-version ou non
import { iconBaseName } from '../scripts/appIcon.js';
// [i18n.ts] Traductions du processus principal : langue du système, dictionnaire et fonction `t`
import { getDictionary, getLocale, t } from '../scripts/i18n.js';
// [PermissionStore.ts] Mémoire durable des décisions de permissions (caméra/micro, localisation) des sites tiers
import type { PermissionStore } from '../scripts/PermissionStore.js';
// [Seasons.ts] Saisons : dates officielles des équinoxes et des solstices, et thème de saison du jour
import { seasonInfo } from '../scripts/Seasons.js';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl, toSafeHref } from '../scripts/safeUrl.js';
// [UpdateManager.ts] Gestionnaire de mises à jour : Squirrel, AppImage, GitHub (Linux) et canal de pré-versions
import type { UpdateManager } from '../scripts/UpdateManager.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, internalChannels, pageEventList } from '../shared/ipc/events.js';
// [mediaLimits.ts] Bornes de l'état média envoyé par un site (taille du message, débit)
import { MIN_MEDIA_STATE_INTERVAL_MS } from '../shared/mediaLimits.js';
// [requestThrottle.ts] Limiteur de débit : une demande par intervalle, les autres sont ignorées
import { createRequestThrottle } from '../shared/requestThrottle.js';
// [AppListService.ts] Service des applications de la barre : ordre, séparateurs, validation et enregistrement
import { AppListService } from './apps/AppListService.js';
// [FaviconService.ts] Service des icônes de sites : cherche, garde en mémoire et enregistre sur disque
import { CACHE_FILE, FaviconService } from './apps/FaviconService.js';
// [AppViewHost.ts] Hôte des sites ouverts en arrière-plan : vues, indicateurs (non-lus, son, morceau) et sourdine
import { AppViewHost } from './apps/AppViewHost.js';
// [ContextMenuController.ts] Contrôleur du menu contextuel : décide où il s'ouvre et ce qu'il contient
import { ContextMenuController } from './contextmenu/ContextMenuController.js';
// [electronContextMenu.ts] Menu contextuel Electron : injecte le script de clic droit et ouvre la fenêtre du menu
import { showAppsWindowMenu, startContextMenu } from './contextmenu/electronContextMenu.js';
// [contextMenuModel.ts] Contenu du menu contextuel des boutons de la barre (mode normal et mode édition)
import { buildAppsWindowMenu } from './contextmenu/contextMenuModel.js';
// [createAppBar.ts] Assemble la barre ancrée : appels natifs Windows et conversions d'écran d'Electron
import { createAppBar, isAppBarSupported } from './dock/createAppBar.js';
// [IpcRouter.ts] Routeur des appels IPC des pages vers le processus principal, avec contrôle de l'origine
import { IpcRouter } from './ipc/IpcRouter.js';
// [trustedSender.ts] Contrôle de l'origine d'un appel IPC : seule la page principale d'une page de l'application est de confiance
import { isTrustedSender } from './ipc/trustedSender.js';
// [mediaState.ts] Calculs purs autour de l'état média des applications : avancée, contenu du popup, lecteurs ignorés
import { describeNowPlaying, changedIgnored, mediaPayload, mediaProgress, splitTaskbarPlayers } from './media/mediaState.js';
// [MediaPopup.ts] Popup de contrôle du morceau en cours, affiché au survol d'un bouton de la barre
import { MediaPopup } from './media/MediaPopup.js';
// [JsonFileStore.ts] Fichier JSON sûr : écriture atomique, sauvegarde `.bak`, mise en quarantaine d'un fichier corrompu
import { JsonFileStore, dataDirectory } from './persistence/JsonFileStore.js';
// [webContentsHardener.ts] Durcit le contenu web d'un site tiers : popups, navigation et `<webview>` restreints
import { hardenWebContents } from './security/webContentsHardener.js';
// [applySettingsUpdate.ts] Applique les réglages envoyés par la page des paramètres et dit ce qui demande une réaction
import { applySettingsUpdate } from './settings/applySettingsUpdate.js';
// [defaultSettings.ts] Instance unique des réglages de l'application, lue dans le fichier `settings.rcft`
import { getSettings } from './settings/defaultSettings.js';
// [ThemeService.ts] Application du thème de l'utilisateur aux pages locales, et mise à jour quand il change
import { ThemeService } from './theming/ThemeService.js';
// [electronThemeEnvironment.ts] Branchement du thème sur Electron (nativeTheme, powerMonitor, webContents)
import { createElectronThemeEnvironment } from './theming/electronThemeEnvironment.js';
// [ToolbarController.ts] Contrôleur de la barre : dépliée ou repliée, ancrée ou flottante, modes bouton, souris et masquage automatique
import { ToolbarController } from './toolbar/ToolbarController.js';
// [TooltipPopup.ts] Infobulle affichée à droite de la barre, au niveau du bouton survolé
import { TooltipPopup } from './tooltip/TooltipPopup.js';
// [electronTray.ts] Branchement de l'icône de la zone de notification sur Electron (Tray, Menu, nativeImage)
import { createElectronTray } from './tray/electronTray.js';
// [trayTooltip.ts] Texte de l'infobulle de la zone de notification : texte de base, pré-version et mise à jour
import type { TrayUpdateInfo } from './tray/trayTooltip.js';
// [updateBadge.ts] Pastille de couleur dessinée sur l'icône de la zone de notification pour signaler une mise à jour
import { updateLevelOf } from './tray/updateBadge.js';
// [AppWindows.ts] Création et suivi des fenêtres de l'application (barre, bouton, infobulles, paramètres, sites)
import { AppWindows } from './windows/AppWindows.js';
// [displays.ts] Choix de l'écran de la barre et description des écrans pour la page des paramètres
import { describeDisplays, pickDisplay } from './windows/displays.js';
// [windowSpecs.ts] Descriptions (taille, position, style, page) de chaque fenêtre de l'interface
import { APPS_HEADER_HEIGHT, MEDIA_POPUP_HEIGHT, TOOLTIP_HEIGHT } from './windows/windowSpecs.js';

/** Raccourci clavier global qui affiche ou cache la barre. */
export const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+B';

/** Délai (ms) avant de masquer la fenêtre du morceau quand le pointeur quitte le bouton. */
const MEDIA_POPUP_HIDE_DELAY_MS = 250;
/** Délai maximal d'une requête de recherche d'icône (page ou image). */
const FAVICON_TIMEOUT_MS = 15000;

/** Racine de l'application construite (`dist/`) : ce fichier est dans `dist/src/main/`. */
const APP_ROOT = path.join(__dirname, '..', '..');

/** Services créés par `bootstrap.ts` avant l'application et qu'elle utilise sans les construire. */
export interface AppServices {
  /** Gestionnaire de mises à jour (vérification, installation, état). */
  readonly updater: UpdateManager;
  /** Magasin des décisions de permission prises pour les sites. */
  readonly permissions: PermissionStore;
  /** Vrai en mode développement (`--dev`). */
  readonly isDev: boolean;
}

/** @returns L'identifiant de navigateur d'Electron sans les mentions « Electron/… » et du nom de l'application */
const browserUserAgent = (): string => session.defaultSession.getUserAgent().replace(/\s(Electron|rotomecatoolbar)\/\S+/gi, '');

/** Vrai si la valeur reçue d'une page est un objet, ce qui permet d'en lire les champs avant de les vérifier. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** L'application : assemble les services (fenêtres, barre, applications, médias, zone de notification) et route les appels des pages. */
export class App {
  private readonly settings = getSettings();
  private readonly preload = path.join(APP_ROOT, 'preload.js');
  private readonly appIcon = path.join(APP_ROOT, 'src', 'pictures', `${iconBaseName(app.getVersion())}.png`);
  private readonly trayIconPath =
    process.platform === 'win32' ? path.join(APP_ROOT, 'src', 'pictures', `${iconBaseName(app.getVersion())}.ico`) : this.appIcon;

  /** Applications qui jouent un morceau mais ne pilotent pas la barre des tâches. */
  private taskbarIgnored = new Set<string>();

  /** Un site ne peut pas inonder le processus principal d'états média (le script légitime en publie un par seconde). */
  private readonly allowMediaState = createRequestThrottle(MIN_MEDIA_STATE_INTERVAL_MS);

  private readonly contextMenu: ContextMenuController;
  private readonly windows: AppWindows;
  private readonly toolbar: ToolbarController;
  private readonly theme: ThemeService;
  private readonly viewHost: AppViewHost<WebContentsView>;
  private readonly appList: AppListService;
  private readonly favicons: FaviconService;
  private readonly mediaPopup: MediaPopup;
  private readonly tooltipPopup: TooltipPopup;
  private readonly tray: ReturnType<typeof createElectronTray>;

  /**
   * Construit les services et les relie entre eux. Les dépendances croisées (par exemple la barre qui
   * masque les popups) passent par des fonctions évaluées à l'usage : l'ordre de création n'a donc pas
   * d'importance tant que rien n'est appelé avant `start()`.
   *
   * @param services Services créés en amont par `bootstrap.ts`.
   */
  constructor(private readonly services: AppServices) {
    this.contextMenu = new ContextMenuController({
      isToolbarWindow: (id) => id === this.windows.getBrowser('toolbar')?.id,
      isMuted: (url) => this.viewHost.isMuted(url),
      translate: t,
    });

    this.windows = new AppWindows({
      specContext: () => ({
        appRoot: APP_ROOT,
        preload: this.preload,
        appIcon: this.appIcon,
        layout: this.toolbar.layout,
        translate: t,
      }),
      appsBounds: () => this.toolbar.layout.apps,
      appRoot: APP_ROOT,
      openExternal: (url) => void shell.openExternal(url),
      preload: this.preload,
      appsHeaderPage: path.join(APP_ROOT, 'src', 'page.apps', 'apps.html'),
      baseCssPath: path.join(APP_ROOT, 'src', 'css', 'app.css'),
      onAppsHeaderReady: (header) => header.postMessage(pageEventList.frameOpen, this.viewHost.lastOpened),
    });

    this.toolbar = new ToolbarController({
      windows: this.windows,
      settings: this.settings,
      displays: {
        bounds: () => this.chosenDisplay().bounds,
        workArea: () => this.chosenDisplay().workArea,
        scaleFactorAt: (rect) => screen.getDisplayMatching(rect).scaleFactor,
        cursor: () => screen.getCursorScreenPoint(),
      },
      timers: {
        setInterval: (callback, delayMs) => setInterval(callback, delayMs),
        clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
        now: () => Date.now(),
      },
      appBarSupported: isAppBarSupported,
      createAppBar,
      messages: {
        appsClosed: () => this.windows.toolbar.webContents.postMessage(pageEventList.windowAppsClosed, true),
        buttonClosed: () => this.windows.main.webContents.postMessage(pageEventList.toolbarClosed, true),
      },
      hidePopups: () => {
        this.mediaPopup.hide();
        this.tooltipPopup.hide();
      },
      onToolbarPageReady: () => this.sendInitialState(),
    });

    this.theme = new ThemeService(this.settings, createElectronThemeEnvironment());

    this.viewHost = new AppViewHost<WebContentsView>({
      surface: {
        getBounds: () => this.windows.apps.getBounds(),
        show: () => this.windows.apps.show(),
        hide: () => this.windows.apps.hide(),
        addChildView: (view) => this.windows.apps.contentView.addChildView(view),
        removeChildView: (view) => this.windows.apps.contentView.removeChildView(view),
        announceOpened: (url) => {
          const [header] = this.windows.apps.contentView.children;
          if (header instanceof WebContentsView) header.webContents.postMessage(pageEventList.frameOpen, url);
        },
      },
      createView: () => {
        // Site tiers : bac à sable et isolation explicites (défauts d'Electron, mais ici la frontière
        // de sécurité de l'application). Session par défaut (persistante) : on ne vide jamais son stockage.
        const view = new WebContentsView({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(APP_ROOT, 'src', 'scripts', 'media', 'media-preload.js'),
          },
        });
        hardenWebContents(view.webContents);
        return view;
      },
      isSafeUrl,
      headerHeight: APPS_HEADER_HEIGHT,
      onChange: (url) => this.sendIndicators(url),
      mediaActionChannel: internalChannels.mediaAction,
    });

    this.favicons = new FaviconService({
      repository: new JsonFileStore(dataDirectory(), CACHE_FILE),
      now: () => Date.now(),
      // Sans cookies (aucune donnée de l'utilisateur envoyée) et avec l'identifiant d'un navigateur ordinaire :
      // certains serveurs (Tchap) ne répondent pas à « Electron/x.y.z »
      fetch: (url) =>
        net.fetch(url, {
          credentials: 'omit',
          headers: { 'user-agent': browserUserAgent() },
          signal: AbortSignal.timeout(FAVICON_TIMEOUT_MS),
        }),
    });

    const store = new JsonFileStore(dataDirectory(), 'data.rsft');
    this.appList = new AppListService({
      repository: {
        save: (data) => {
          store.save(data);
          this.contextMenu.updateSaves(data);
        },
        loadAsync: async () => {
          const data = await store.loadAsync();
          if (data !== false) this.contextMenu.updateSaves(data);
          return data;
        },
      },
      toolbar: {
        appAdded: (entry) => this.toolbarMessage(pageEventList.appAdded, entry),
        appInserted: (args) => this.toolbarMessage(pageEventList.appInserted, args),
        appUpdated: (args) => this.toolbarMessage(pageEventList.appUpdated, args),
        appDeleted: (url) => this.toolbarMessage(pageEventList.toolbarAppDeleted, url),
        separatorDeleted: (reference) => this.toolbarMessage(pageEventList.toolbarAppSeparatorDelete, reference),
        appMoved: (args) => this.toolbarMessage(pageEventList.windowAppMovement, args),
      },
      onSaveError: (error) => dialog.showErrorBox(t('dialog.error'), t('dialog.saveFailed', { error: error.message })),
    });

    this.mediaPopup = new MediaPopup({
      window: () => this.windows.media,
      existingWindow: () => this.windows.getBrowser('media'),
      payloadFor: (url) => this.mediaPayloadOf(url),
      toolbarBounds: () => this.windows.toolbar.getBounds(),
      workArea: () => this.chosenDisplay().workArea,
      scheduler: {
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
      },
      height: MEDIA_POPUP_HEIGHT,
      hideDelayMs: MEDIA_POPUP_HIDE_DELAY_MS,
      stateChannel: pageEventList.mediaState,
    });

    this.tooltipPopup = new TooltipPopup({
      window: () => this.windows.tooltip,
      existingWindow: () => this.windows.getBrowser('tooltip'),
      toolbarBounds: () => this.windows.toolbar.getBounds(),
      workArea: () => this.chosenDisplay().workArea,
      height: TOOLTIP_HEIGHT,
      stateChannel: pageEventList.tooltipState,
    });

    this.tray = createElectronTray({
      trayIconPath: this.trayIconPath,
      appIconPath: this.appIcon,
      updateInfo: () => this.trayUpdateInfo(),
      translate: t,
      shortcut: TOGGLE_SHORTCUT,
      isDev: services.isDev,
      actions: {
        toggleToolbar: () => this.toolbar.toggleFromOutside(),
        openSettings: () => this.openSettings(),
        quit: () => app.quit(),
      },
    });
  }

  /** Démarre l'application : thème, mises à jour, menu contextuel, icône, appels des pages, écrans, barre. */
  start(): void {
    this.theme.start();
    this.services.updater.start();
    startContextMenu(this.contextMenu, APP_ROOT);
    this.tray.start();

    // Les routes IPC existent avant la première page : le preload demande les traductions dès son chargement
    this.registerIpcRoutes();

    if (this.toolbar.mode.button) this.windows.main.focus();

    const reposition = (): void => this.toolbar.repositionWindows();
    screen.on('display-metrics-changed', reposition);
    screen.on('display-added', reposition);
    screen.on('display-removed', reposition);

    this.toolbar.start();
  }

  /** Affiche ou cache la barre (raccourci clavier global). */
  toggleToolbar(): void {
    this.toolbar.toggleFromOutside();
  }

  /** Libère l'espace réservé par la barre ancrée (avant de quitter). */
  releaseDock(): void {
    this.toolbar.detachAppBar();
  }

  /** L'état de la mise à jour a changé : les pages et l'icône de la zone de notification le reflètent. */
  onUpdateChanged(state: unknown): void {
    for (const name of ['settings', 'toolbar'] as const) {
      this.windows.getBrowser(name)?.webContents.postMessage(pageEventList.updateState, state);
    }
    this.tray.refresh();
  }

  /** Ouvre les paramètres (ou les ramène au premier plan). */
  openSettings(): void {
    const existing = this.windows.getBrowser('settings');
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }

    const win = this.windows.createSettings();
    win.setMenuBarVisibility(false);
    win.addListener('closed', () => this.windows.remove('settings'));

    win.webContents
      .executeJavaScript(
        `window.electron ??= {}; window.electron.settings = { isButtonModeEnabled: ${this.toolbar.mode.button} };`,
      )
      .catch(console.error);

    win.webContents.on('dom-ready', () => {
      win.webContents.postMessage(pageEventList.settingsStart, this.settings.filePath);
    });

    win.show();

    this.settings.save();
  }

  /** @returns L'écran choisi dans les paramètres, ou l'écran principal s'il n'existe plus */
  private chosenDisplay(): Electron.Display {
    return pickDisplay(screen.getAllDisplays(), this.settings.displayId, screen.getPrimaryDisplay());
  }

  /**
   * Envoie un message à la page de la barre.
   *
   * @param channel Canal de `pageEventList`.
   * @param payload Données transmises à la page.
   */
  private toolbarMessage(channel: string, payload: unknown): void {
    this.windows.toolbar.webContents.postMessage(channel, payload);
  }

  /** Charge les applications dans la barre et envoie les indicateurs des sites déjà ouverts. */
  private async sendInitialState(): Promise<void> {
    const loaded = await this.appList.load();

    this.toolbarMessage(loaded ? pageEventList.init : 'init', {
      saves: loaded ? this.appList.entries : [],
      settings: { isButton: this.toolbar.mode.button },
    });

    // La barre peut avoir été recréée alors que des sites tournent déjà
    for (const url of this.viewHost.knownUrls()) this.sendIndicators(url);
  }

  /** @returns L'état de la mise à jour tel que l'attend la zone de notification, ou `null` s'il n'y en a pas encore */
  private trayUpdateInfo(): TrayUpdateInfo | null {
    const { state } = this.services.updater;
    if (!state) return null;

    return {
      prerelease: state.prerelease,
      versionActuelle: state.versionActuelle,
      versionDisponible: state.versionDisponible,
      level: updateLevelOf(state.etat),
    };
  }

  // #region Indicateurs et médias

  /**
   * Propage un changement d'état d'un site (badge, son, morceau) à la barre, à la fenêtre du morceau
   * et à l'infobulle de la zone de notification.
   *
   * @param url Adresse de l'application dont l'état a changé.
   */
  private sendIndicators(url: string): void {
    this.postIndicators(url);
    this.mediaPopup.refresh(url);
    this.updateTaskbar();
  }

  /**
   * Envoie à la barre les indicateurs d'un bouton : badge, son, pochette, progression, lecteur ignoré.
   *
   * @param url Adresse de l'application concernée.
   */
  private postIndicators(url: string): void {
    const entry = this.viewHost.entry(url);

    this.windows.getBrowser('toolbar')?.webContents.postMessage(pageEventList.appIndicators, {
      url,
      badge: entry?.badge ?? 0,
      audible: entry?.audible ?? false,
      muted: this.viewHost.isMuted(url),
      cover: entry?.media?.artwork ?? null,
      progress: mediaProgress(entry?.media),
      hasMedia: !!entry?.media,
      ignored: this.taskbarIgnored.has(url),
    });
  }

  /** Reflète le premier morceau en cours dans l'infobulle de la zone de notification (les autres lecteurs sont ignorés). */
  private updateTaskbar(): void {
    const { first, others } = splitTaskbarPlayers(this.viewHost.playingUrls());

    const previous = this.taskbarIgnored;
    this.taskbarIgnored = new Set(others);
    for (const url of changedIgnored(previous, this.taskbarIgnored)) this.postIndicators(url);

    const media = first ? this.viewHost.entry(first)?.media : undefined;
    this.tray.showTooltip(media ? describeNowPlaying(media, others.length, t) : t('tray.tooltip'));
  }

  /**
   * @param url Adresse de l'application.
   * @returns Les données affichées par la fenêtre du morceau pour cette application
   */
  private mediaPayloadOf(url: string): ReturnType<typeof mediaPayload> {
    return mediaPayload(url, this.viewHost.entry(url)?.media, this.viewHost.isMuted(url));
  }

  /**
   * Reçoit le morceau en cours d'un site (depuis son preload). Les messages venant d'un sous-cadre
   * sont ignorés, et les données sont nettoyées avant d'être stockées.
   *
   * @param event Évènement IPC, qui permet d'identifier le site émetteur.
   * @param raw État média brut, non fiable.
   */
  private onMediaState(event: IpcMainEvent, raw: unknown): void {
    if (event.senderFrame !== event.sender.mainFrame || !this.allowMediaState(event.sender.id)) return;

    const url = this.viewHost.urlOfWebContents(event.sender.id);
    if (url) this.viewHost.update(url, { media: sanitizeMediaState(raw) });
  }

  // #endregion

  // #region Fenêtres

  /**
   * Ouvre la fenêtre d'ajout, ou d'édition si une application est donnée. À sa fermeture, la barre
   * est réaffichée.
   *
   * @param data Application à modifier ; absent pour un ajout.
   */
  private openAddDialog(data?: { readonly url?: string }): void {
    this.toolbarMessage(pageEventList.windowAppsClosed, true);

    const dialogWindow = this.windows.addDialog;
    dialogWindow.setMenuBarVisibility(false);
    dialogWindow.once('closed', () => {
      this.windows.toolbar.show();
      this.toolbarMessage(pageEventList.appEdited, false);

      if (this.toolbar.mode.button) this.windows.main.show();
    });

    this.toolbarMessage(pageEventList.appEdited, true);

    if (data?.url) {
      dialogWindow.loadFile(path.join(APP_ROOT, 'src', 'page.add', 'edit.html')).catch(console.error);
      dialogWindow.title = t('window.edit');
      dialogWindow.webContents.on('dom-ready', () => {
        dialogWindow.webContents.postMessage(pageEventList.modeEdit, data);
      });
    } else {
      dialogWindow.loadFile(path.join(APP_ROOT, 'src', 'page.add', 'add.html')).catch(console.error);
    }

    dialogWindow.show();
  }

  /**
   * Arrête un site (sa vue est détruite) et peut l'ouvrir dans le navigateur par défaut.
   *
   * @param url Adresse de l'application ; ignorée si ce n'est pas une chaîne.
   * @param open Si `true`, ouvre l'adresse dans le navigateur (seulement si elle est sûre) et masque la barre.
   */
  private killApp(url: unknown, open: unknown): void {
    if (typeof url !== 'string') return;

    this.viewHost.discard(url);
    this.toolbarMessage(pageEventList.windowAppsClosed, true);

    if (open !== true) return;

    if (this.toolbar.mode.button) this.windows.main.webContents.postMessage(pageEventList.toolbarClosed, true);
    else this.windows.toolbar.hide();

    // La forme normalisée, pas la chaîne brute : le système ne doit lire que ce que le contrôle a compris
    const href = toSafeHref(url);
    if (href) void shell.openExternal(href);
  }

  /** Masque la zone des applications et prévient la barre pour qu'elle désélectionne le bouton actif. */
  private closeApps(): void {
    this.windows.apps.hide();
    this.toolbarMessage(pageEventList.windowAppsClosed, true);
  }

  /**
   * Applique des paramètres envoyés par la page des paramètres, puis en répercute les effets
   * (repositionnement, thème, reconstruction de la barre si le mode d'affichage change).
   *
   * @param raw Paramètres bruts, non fiables : validés par `applySettingsUpdate`.
   */
  private onSettingsUpdated(raw: unknown): void {
    const result = applySettingsUpdate(this.settings, raw);
    if (!result) return;

    if (result.screenChanged) this.toolbar.repositionWindows();

    this.theme.broadcast();

    if (result.displayModeChanged) this.toolbar.rebuildForModeChange();
  }

  // #endregion

  // #region Appels des pages

  /**
   * Associe chaque canal de `appEventList` à l'action du service qui le traite. Les arguments sont
   * vérifiés ici (type, forme) avant d'être transmis. Enregistre aussi les deux canaux internes :
   * l'état média envoyé par le preload des sites, et les traductions demandées par le preload des pages locales.
   */
  private registerIpcRoutes(): void {
    const { toolbar, appList, viewHost, windows, services } = this;
    const router = new IpcRouter<IpcMainInvokeEvent>(ipcMain, APP_ROOT);

    router
      .handle(appEventList.toggleToolbar, () => toolbar.toggle())
      .handle(appEventList.requestToggle, () => toolbar.toggleFromOutside())
      .handle(appEventList.edgeEnter, () => toolbar.onEdgeEntered())
      .handle(appEventList.timeoutStopTop, () => toolbar.suspendAlwaysOnTop())
      .handle(appEventList.toggleStopTop, () => toolbar.toggleAlwaysOnTop())
      .handle(appEventList.requestAdd, () => this.openAddDialog())
      .handle(appEventList.requestAddData, (_, data) => appList.add(data))
      .handle(appEventList.requestAddSeparator, (_, url) => {
        appList.addSeparatorAfter(url);
        windows.toolbar.focus();
      })
      .handle(appEventList.requestAddDataEdit, (_, data) => {
        const added = appList.addForEdit(data);
        if (!added) return;

        windows.remove('add_dialog');
        this.openAddDialog(added);
      })
      .handle(appEventList.requestUpdatedData, (_, data) => {
        if (appList.update(data)) windows.remove('add_dialog');
      })
      .handle(appEventList.requestMovement, (_, args) => {
        if (appList.move(args)) windows.toolbar.focus();
      })
      .handle(appEventList.getSavedUrls, () => appList.urls())
      .handle(appEventList.appEdit, (_, data) => {
        if (!isRecord(data) || typeof data.url !== 'string') return;

        this.openAddDialog({ ...data, url: data.url, index: appList.indexOf(data.url) } as { url: string });
      })
      .handle(appEventList.appDelete, (_, url) => {
        if (typeof url !== 'string') return;

        viewHost.discard(url);
        appList.remove(url);
        windows.toolbar.focus();
      })
      .handle(appEventList.openFrame, (_, url) => viewHost.open(url))
      .handle(appEventList.closeFrame, (_, url) => {
        if (typeof url === 'string') viewHost.hide(url);
      })
      .handle(appEventList.closeApps, () => this.closeApps())
      .handle(appEventList.getFavicon, (_, url) => (typeof url === 'string' ? this.favicons.resolve(url) : null))
      .handle(appEventList.appsContextMenu, () =>
        showAppsWindowMenu(windows.apps, buildAppsWindowMenu(t, { resetSize: () => windows.resetAppsSize() })),
      )
      .handle(appEventList.killApp, (_, url, open) => this.killApp(url, open))
      .handle(appEventList.refreshApp, (_, url) => {
        if (typeof url === 'string') viewHost.reload(url);
      })
      .handle(appEventList.minimiseWindow, (_, name) => {
        if (name === 'add') windows.getBrowser('add_dialog')?.minimize();
      })
      .handle(appEventList.toggleMute, (_, args) => viewHost.toggleMute(isRecord(args) ? args.url : undefined))
      .handle(appEventList.mediaControl, (_, args) => {
        if (isRecord(args)) viewHost.controlMedia(args.url, args.action);
      })
      .handle(appEventList.mediaHover, (_, args) => {
        const { url, hovering, y } = isRecord(args) ? args : ({} as Record<string, unknown>);
        this.mediaPopup.hover(url, !!hovering, y);
      })
      .handle(appEventList.tooltipShow, (_, args) => this.tooltipPopup.show(args))
      .handle(appEventList.tooltipHide, () => this.tooltipPopup.hide())
      .handle(appEventList.settingsUpdated, (_, settings) => this.onSettingsUpdated(settings))
      .handle(appEventList.openSettings, () => this.openSettings())
      .handle(appEventList.getSeasonInfo, () => seasonInfo())
      .handle(appEventList.getVersion, () => app.getVersion())
      .handle(appEventList.isAppBarSupported, () => isAppBarSupported())
      .handle(appEventList.getDisplays, () => describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id, t))
      .handle(appEventList.updateGetState, () => services.updater.state)
      .handle(appEventList.updateCheck, () => services.updater.check())
      .handle(appEventList.updateCheckTest, () => services.updater.checkTest())
      .handle(appEventList.updateInstall, () => services.updater.install())
      .handle(appEventList.updateInstallTest, () => services.updater.installTest())
      .handle(appEventList.permissionsList, () => services.permissions.list())
      .handle(appEventList.permissionRevoke, (_, decision) => {
        const { origin, permission } = isRecord(decision) ? decision : ({} as Record<string, unknown>);
        // Une demande mal formée est sans effet : le magasin ne connaît aucune décision pour ces valeurs
        services.permissions.revoke(String(origin), String(permission));
        return services.permissions.list();
      })
      .handle(appEventList.permissionsClear, () => {
        services.permissions.clear();
        return services.permissions.list();
      });

    // Envoyé par le preload des sites (pas par nos pages locales)
    ipcMain.on(internalChannels.mediaState, (event, raw: unknown) => this.onMediaState(event, raw));

    // Traductions demandées (de façon synchrone) par le preload de nos pages
    ipcMain.on(internalChannels.i18n, (event) => {
      event.returnValue = isTrustedSender(event, APP_ROOT) ? { locale: getLocale(), dict: getDictionary() } : {};
    });
  }

  // #endregion
}
