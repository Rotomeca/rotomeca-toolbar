import path from 'node:path';
import { WebContentsView, app, dialog, ipcMain, screen, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { sanitizeMediaState } from '../scripts/AppIndicators.js';
import { iconBaseName } from '../scripts/appIcon.js';
import { getDictionary, getLocale, t } from '../scripts/i18n.js';
import type { PermissionStore } from '../scripts/PermissionStore.js';
import { seasonInfo } from '../scripts/Seasons.js';
import { isSafeUrl } from '../scripts/safeUrl.js';
import type { UpdateManager } from '../scripts/UpdateManager.js';
import { appEventList, internalChannels, pageEventList } from '../shared/ipc/events.js';
import { AppListService } from './apps/AppListService.js';
import { AppViewHost } from './apps/AppViewHost.js';
import { ContextMenuController } from './contextmenu/ContextMenuController.js';
import { startContextMenu } from './contextmenu/electronContextMenu.js';
import { createAppBar, isAppBarSupported } from './dock/createAppBar.js';
import { IpcRouter } from './ipc/IpcRouter.js';
import { describeNowPlaying, changedIgnored, mediaPayload, mediaProgress, splitTaskbarPlayers } from './media/mediaState.js';
import { MediaPopup } from './media/MediaPopup.js';
import { JsonFileStore, dataDirectory } from './persistence/JsonFileStore.js';
import { hardenWebContents } from './security/webContentsHardener.js';
import { applySettingsUpdate } from './settings/applySettingsUpdate.js';
import { getSettings } from './settings/defaultSettings.js';
import { ThemeService } from './theming/ThemeService.js';
import { createElectronThemeEnvironment } from './theming/electronThemeEnvironment.js';
import { ToolbarController } from './toolbar/ToolbarController.js';
import { TooltipPopup } from './tooltip/TooltipPopup.js';
import { createElectronTray } from './tray/electronTray.js';
import type { TrayUpdateInfo } from './tray/trayTooltip.js';
import { updateLevelOf } from './tray/updateBadge.js';
import { AppWindows } from './windows/AppWindows.js';
import { describeDisplays, pickDisplay } from './windows/displays.js';
import { APPS_HEADER_HEIGHT, MEDIA_POPUP_HEIGHT, TOOLTIP_HEIGHT } from './windows/windowSpecs.js';

/** Raccourci clavier global qui affiche ou cache la barre. */
export const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+B';

/** Délai (ms) avant de masquer la fenêtre du morceau quand le pointeur quitte le bouton. */
const MEDIA_POPUP_HIDE_DELAY_MS = 250;

/** Racine de l'application construite (`dist/`) : ce fichier est dans `dist/src/main/`. */
const APP_ROOT = path.join(__dirname, '..', '..');

export interface AppServices {
  readonly updater: UpdateManager;
  readonly permissions: PermissionStore;
  readonly isDev: boolean;
}

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

  private readonly contextMenu: ContextMenuController;
  private readonly windows: AppWindows;
  private readonly toolbar: ToolbarController;
  private readonly theme: ThemeService;
  private readonly viewHost: AppViewHost<WebContentsView>;
  private readonly appList: AppListService;
  private readonly mediaPopup: MediaPopup;
  private readonly tooltipPopup: TooltipPopup;
  private readonly tray: ReturnType<typeof createElectronTray>;

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
    startContextMenu(this.contextMenu);
    this.tray.start();

    if (this.toolbar.mode.button) this.windows.main.focus();

    this.registerIpcRoutes();

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

  private sendIndicators(url: string): void {
    this.postIndicators(url);
    this.mediaPopup.refresh(url);
    this.updateTaskbar();
  }

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

  private mediaPayloadOf(url: string): ReturnType<typeof mediaPayload> {
    return mediaPayload(url, this.viewHost.entry(url)?.media, this.viewHost.isMuted(url));
  }

  /** Reçoit le morceau en cours d'un site (depuis son preload). */
  private onMediaState(event: IpcMainEvent, raw: unknown): void {
    if (event.senderFrame !== event.sender.mainFrame) return;

    const url = this.viewHost.urlOfWebContents(event.sender.id);
    if (url) this.viewHost.update(url, { media: sanitizeMediaState(raw) });
  }

  // #endregion

  // #region Fenêtres

  /** Ouvre la fenêtre d'ajout, ou d'édition si une application est donnée. */
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

  private killApp(url: unknown, open: unknown): void {
    if (typeof url !== 'string') return;

    this.viewHost.discard(url);
    this.toolbarMessage(pageEventList.windowAppsClosed, true);

    if (open !== true) return;

    if (this.toolbar.mode.button) this.windows.main.webContents.postMessage(pageEventList.toolbarClosed, true);
    else this.windows.toolbar.hide();

    if (isSafeUrl(url)) void shell.openExternal(url);
  }

  private closeApps(): void {
    this.windows.apps.hide();
    this.toolbarMessage(pageEventList.windowAppsClosed, true);
  }

  private onSettingsUpdated(raw: unknown): void {
    const result = applySettingsUpdate(this.settings, raw);
    if (!result) return;

    if (result.screenChanged) this.toolbar.repositionWindows();

    this.theme.broadcast();

    if (result.displayModeChanged) this.toolbar.rebuildForModeChange();
  }

  // #endregion

  // #region Appels des pages

  private registerIpcRoutes(): void {
    const { toolbar, appList, viewHost, windows, services } = this;
    const router = new IpcRouter<IpcMainInvokeEvent>(ipcMain);

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
      const frame = event.senderFrame;
      event.returnValue =
        frame && frame === event.sender.mainFrame && frame.url.startsWith('file://')
          ? { locale: getLocale(), dict: getDictionary() }
          : {};
    });
  }

  // #endregion
}
