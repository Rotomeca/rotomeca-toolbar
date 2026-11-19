// Doit être exécuté en premier : évènements d'installation/mise à jour Squirrel
if (require('electron-squirrel-startup')) {
  require('electron').app.quit();
  return;
}

// Mode « fumée » : vérifie que le paquet est sain puis quitte, sans démarrer l'application
// (ni barre ancrée, ni raccourci global, ni verrou d'instance, ni données de l'utilisateur)
if (process.argv.includes('--smoke')) {
  require('./src/scripts/smokeRun.js').run();
  return;
}

const {
  app,
  nativeTheme,
  powerMonitor,
  BrowserWindow,
  session,
  WebContentsView,
  Tray,
  Menu,
  shell,
  screen,
  autoUpdater,
  Notification,
  nativeImage,
  dialog,
  ipcMain,
  globalShortcut,
  net,
} = require('electron');

const path = require('path');
const { BaseAppObject } = require('./src/main/windows/BaseAppObject.js');
const { BaseWindow } = require('electron/main');
const {
  pinUserData,
  migrateLegacyData,
  backupUserData,
  restoreFromBackup,
  flushSession,
  keepLoginsAlive,
  logCookieState,
} = require('./src/scripts/Persistence.js');
const {
  appEventList,
  pageEventList,
  internalChannels,
} = require('./src/shared/ipc/events.js');
const { t, getLocale, getDictionary } = require('./src/scripts/i18n.js');
const {
  createAppBar,
  isAppBarSupported,
} = require('./src/main/dock/createAppBar.js');
const {
  computeLayout,
  dockRequest,
  dockRequestKey,
  isPointInside,
  stepAutoHide,
} = require('./src/main/dock/dockGeometry.js');
const { UpdateManager } = require('./src/scripts/UpdateManager.js');
const { PermissionStore } = require('./src/scripts/PermissionStore.js');
const { compareVersions, isPrerelease } = require('./src/scripts/versions.js');
const { iconBaseName } = require('./src/scripts/appIcon.js');
const { isSafeUrl } = require('./src/scripts/safeUrl.js');
const {
  resolveUpdateMode,
  createFeedSwitcher,
} = require('./src/main/updates/updateMode.js');
const {
  showUpdateNotification,
} = require('./src/main/updates/updateNotification.js');
const {
  updateLevelOf,
  badgeCornerFor,
  paintUpdateBadge,
} = require('./src/main/tray/updateBadge.js');
const { buildTrayTooltip } = require('./src/main/tray/trayTooltip.js');
const {
  mediaProgress,
  mediaPayload,
  splitTaskbarPlayers,
  changedIgnored,
  describeNowPlaying,
} = require('./src/main/media/mediaState.js');
const { centeredTop } = require('./src/main/windows/placement.js');
const { sanitizeAppData } = require('./src/main/security/sanitizeAppData.js');
const {
  ContextMenuController,
} = require('./src/main/contextmenu/ContextMenuController.js');
const {
  startContextMenu,
} = require('./src/main/contextmenu/electronContextMenu.js');
const {
  JsonFileStore,
  dataDirectory,
} = require('./src/main/persistence/JsonFileStore.js');
const {
  savedUrls,
  removeApp,
  moveApp,
  insertSeparatorAfter,
  replaceApp,
} = require('./src/main/apps/appList.js');
const { hardenWebContents } = require('./src/main/security/webContentsHardener.js');
const {
  createPermissionDialog,
} = require('./src/main/permissions/permissionDialog.js');
const {
  installPermissionHandlers,
} = require('./src/main/permissions/installPermissionHandlers.js');
const {
  parseUnreadCount,
  sanitizeMediaState,
  MEDIA_ACTIONS,
} = require('./src/scripts/AppIndicators.js');

// Largeur (px) de la bande réservée à la barre ancrée (AppBar)
const APPBAR_WIDTH = 72;

// Largeur (px) du rail qui reste visible quand la barre est repliée, et place
// réservée à l'écran. Windows impose 32 px au minimum à la fenêtre (vérifié) :
// la page dessine donc une bande de 24 px et laisse les 8 px restants transparents.
const RAIL_WIDTH = 24;

// Barre ancrée en masquage automatique : délai (ms) avant de se replier une
// fois la souris sortie, et période (ms) de la surveillance du curseur
const AUTOHIDE_DELAY = 700;
const AUTOHIDE_POLL = 150;

// Fenêtre « Ajouter une application » (contenu, en px)
const ADD_DIALOG_WIDTH = 640;
const ADD_DIALOG_HEIGHT = 760;

// Hauteur (px) du bandeau d'actions au-dessus des applications
const APPS_HEADER_HEIGHT = 32;

const MEDIA_POPUP_WIDTH = 340;
const MEDIA_POPUP_HEIGHT = 200;
const MEDIA_POPUP_HIDE_DELAY = 250;

// Infobulle de la barre : fenêtre transparente sans clic, plus grande que son contenu
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 48;

// Largeur (px) de la zone sensible au bord gauche de l'écran (mode souris)
const EDGE_WIDTH = 4;

// Raccourci clavier global qui affiche ou cache la barre
const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+B';

class AppMain extends BaseAppObject {
  constructor() {
    super();
    this.views = {};
    this.saves = [];
    this.started = false;
    this.tray;
    this.url;
    this.contextMenu;
    /** Apps dont le son est coupé (conservé tant que l'application tourne) */
    this.mutedUrls = new Set();
    this.mediaHoverUrl = null;
    this.mediaHideTimer = null;
    /** Apps qui jouent un morceau mais ne pilotent pas la barre des tâches */
    this.taskbarIgnored = new Set();
  }

  /**
   * Mode bouton (chevron flottant). Exclu quand la barre est ancrée.
   */
  get settingIsButton() {
    return !this.settingIsAppBar && this.settings.isButtonModeEnabled;
  }

  /**
   * Barre ancrée au bord gauche (AppBar Windows), si disponible.
   */
  get settingIsAppBar() {
    return this.settings.appBarEnabled && isAppBarSupported();
  }

  /**
   * Barre ancrée qui se replie seule quand la souris la quitte.
   */
  get settingIsAutoHide() {
    return this.settingIsAppBar && this.settings.appBarAutoHide;
  }

  /**
   * Largeur actuelle de la barre ancrée : pleine largeur dépliée, rail fin
   * repliée (le rail est la barre elle-même, un clic dessus la déplie).
   */
  get dockedWidth() {
    return this.state ? APPBAR_WIDTH : RAIL_WIDTH;
  }

  /**
   * Mode souris (zone sensible au bord gauche).
   */
  get settingIsMouse() {
    return !this.settingIsAppBar && !this.settings.isButtonModeEnabled;
  }

  /**
   * La barre se déplie quand la souris touche le bord gauche de l'écran.
   */
  get settingUsesEdge() {
    return this.settingIsMouse;
  }

  get theme() {
    return this.settings.theme;
  }

  get appIcon() {
    if (!this.main.icon)
      this.main.icon = path.join(
        __dirname,
        `/src/pictures/${iconBaseName(app.getVersion())}.png`,
      );

    return this.main.icon;
  }

  /**
   * Icône de la zone de notification : le .ico (16 à 256 px) reste net sous Windows.
   */
  get trayIcon() {
    return process.platform === 'win32'
      ? path.join(__dirname, `/src/pictures/${iconBaseName(app.getVersion())}.ico`)
      : this.appIcon;
  }

  get preloadPath() {
    if (!this.main.preload)
      this.main.preload = path.join(__dirname, './preload.js');

    return this.main.preload;
  }

  /**
   * @type {{save: (data: any) => void, loadAsync: () => Promise<any | false>}}
   * @readonly
   */
  get userFileData() {
    if (!this.main.userFileData) {
      const store = new JsonFileStore(dataDirectory(), 'data.rsft');
      // Le menu contextuel suit ce qui est enregistré et chargé
      this.main.userFileData = {
        save: (data) => {
          store.save(data);
          this.contextMenu?.updateSaves(data);
        },
        loadAsync: async () => {
          const data = await store.loadAsync();
          if (data !== false) this.contextMenu?.updateSaves(data);
          return data;
        },
      };
    }

    return this.main.userFileData;
  }

  // #region Windows
  /**
   * @type {BrowserWindow}
   * @readonly
   */
  get mainWindow() {
    return (
      this.getWindow('main') ??
      this.createBrowserWindow('main', {
        ...this.layout.main,
        alwaysOnTop: true,
        frame: false,
        useContentSize: true,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        preload: this.preloadPath, // path to your preload.js file
        file: path.join(__dirname, 'index.html'),
      })
    );
  }

  /**
   * @type {BrowserWindow}
   * @readonly
   */
  get toolbarWindow() {
    return (
      this.getWindow('toolbar') ??
      this.createBrowserWindow('toolbar', {
        ...this.layout.toolbar,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        // useContentSize: true,
        skipTaskbar: true,
        resizable: false,
        preload: this.preloadPath, // path to your preload.js file
        file: path.join(__dirname, '/src/page.taskbar/taskbar.html'),
        show: false,
      })
    );
  }

  /**
   * Petite fenêtre affichée au survol d'un bouton qui joue un morceau.
   * @type {BrowserWindow}
   * @readonly
   */
  get mediaWindow() {
    return (
      this.getWindow('media') ??
      this.createBrowserWindow('media', {
        width: MEDIA_POPUP_WIDTH,
        height: MEDIA_POPUP_HEIGHT,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        preload: this.preloadPath,
        file: path.join(__dirname, '/src/page.media/media.html'),
        show: false,
        extra: { focusable: false },
      })
    );
  }

  /**
   * Infobulle affichée à côté d'un bouton de la barre.
   * @type {BrowserWindow}
   * @readonly
   */
  get tooltipWindow() {
    if (!this.getWindow('tooltip')) {
      const win = this.createBrowserWindow('tooltip', {
        width: TOOLTIP_WIDTH,
        height: TOOLTIP_HEIGHT,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        preload: this.preloadPath,
        file: path.join(__dirname, '/src/page.tooltip/tooltip.html'),
        show: false,
        extra: { focusable: false },
      });
      // Ne capte jamais la souris : elle reste sur le bouton survolé
      win.setIgnoreMouseEvents(true);
    }

    return this.getWindow('tooltip');
  }

  /**
   * @type {BrowserWindow}
   * @readonly
   */
  get addDialogWindow() {
    if (!this.getWindow('add_dialog')) {
      // app.files =
      //   fs.readFileSync('./configs/config.json')?.toString?.() ?? 'null';
      this.createBrowserWindow('add_dialog', {
        title: t('window.add'),
        ...this.layout.addDialog,
        transparent: false,
        frame: true,
        alwaysOnTop: true,
        useContentSize: true,
        skipTaskbar: false,
        minimizable: true,
        maximizable: false,
        icon: this.appIcon,
        preload: this.preloadPath, // path to your preload.js file
        // file: path.join(__dirname, '/src/page.add/add.html'),
        show: false,
        extra: {
          vibrancy: 'fullscreen-ui', // on MacOS
          backgroundMaterial: 'acrylic', // on Windows 11
        },
      });

      //win.webContents.openDevTools();

      // win.webContents.addListener('dom-ready', () => {
      //   win.webContents.executeJavaScript(`
      //   window.electron ??= {};
      //   window.electron.files = ${
      //     fs.readFileSync('./configs/config.json')?.toString?.() ?? 'null'
      //   };
      //   `);
      // });
    }

    return this.getWindow('add_dialog');
  }

  /**
   * Fine fenêtre quasi invisible collée au bord gauche de l'écran : l'entrée
   * de la souris dans cette zone ouvre la barre (mode souris), sans sondage.
   * @type {BrowserWindow}
   * @readonly
   */
  get edgeWindow() {
    return (
      this.getWindow('edge') ??
      this.createBrowserWindow('edge', {
        ...this.layout.edge,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        preload: this.preloadPath,
        file: path.join(__dirname, '/src/page.edge/edge.html'),
        show: false,
        extra: { focusable: false, hasShadow: false },
      })
    );
  }

  get appsWindow() {
    let win = this.getWindow('apps');

    if (!win) {
      win = new BaseWindow({
        ...this.layout.apps,
        alwaysOnTop: true,
        frame: false,
        skipTaskbar: true,
        resizable: true,
        show: false,
      });

      win.on('resize', () => {
        this.appsWindow.contentView.children.forEach((view, i) => {
          view.setBounds({
            x: 0,
            y: i === 0 ? 0 : APPS_HEADER_HEIGHT,
            width: this.appsWindow.getBounds().width,
            height:
              i === 0
                ? APPS_HEADER_HEIGHT
                : this.appsWindow.getBounds().height - APPS_HEADER_HEIGHT,
          });
        });
      });

      const view = new WebContentsView({
        useContentSize: true,
        webPreferences: {
          nodeIntegration: false, // is default value after Electron v5
          contextIsolation: true, // protect against prototype pollution
          enableRemoteModule: false,
          preload: this.preloadPath, // path to your preload.js file
        },
      });
      win.contentView.addChildView(view);
      view.webContents.loadFile(
        path.join(__dirname, '/src/page.apps/apps.html'),
      );
      view.setBounds({
        x: 0,
        y: 0,
        width: win.getBounds().width,
        height: APPS_HEADER_HEIGHT,
      });
      // view.webContents.openDevTools();

      view.webContents.addListener('dom-ready', () => {
        this.appsWindow.contentView.children[0].webContents.postMessage(
          'frameOpen',
          this.url,
        );
      });

      this.addWindow('apps', win);
    }

    return win;
  }
  // #endregion

  init() {
    super.init();
    this.state = false;
  }

  main() {
    super.main();

    this.applyThemeOnLoad();
    this.scheduleSeasonCheck();

    // « Système » : suit le mode clair/sombre de Windows en direct
    nativeTheme.on('updated', () => this.broadcastTheme());

    AppMain.updater?.start();

    this.initContextMenu().initTray();

    if (this.settingIsButton) this.mainWindow.focus(); //.openDevTools();

    this.addEventListener(
      appEventList.toggleToolbar,
      this.event_main_click.bind(this),
    )
      .addEventListener(
        appEventList.requestAdd,
        this.event_toolbar_add_button_click.bind(this),
      )
      .addEventListener(
        appEventList.requestAddData,
        this.event_request_add_data.bind(this),
      )
      .addEventListener(
        appEventList.requestAddSeparator,
        this.event_request_add_separator.bind(this),
      )
      .addEventListener(
        appEventList.requestAddDataEdit,
        this.event_request_add_data_edit.bind(this),
      )
      .addEventListener(
        appEventList.requestUpdatedData,
        this.event_request_updated_data.bind(this),
      )
      .addEventListener(
        appEventList.closeFrame,
        this.event_close_frame.bind(this),
      )
      .addEventListener(appEventList.closeApps, this.event_close_app.bind(this))
      .addEventListener(
        appEventList.openFrame,
        this.event_open_frame.bind(this),
      )
      .addEventListener(
        appEventList.appDelete,
        this.event_app_delete.bind(this),
      )
      .addEventListener(appEventList.appEdit, this.event_app_edit.bind(this))
      .addEventListener(
        appEventList.timeoutStopTop,
        this.event_timeout_stop.bind(this),
      )
      .addEventListener(
        appEventList.toggleStopTop,
        this.event_toggle_stop_top.bind(this),
      )
      .addEventListener(
        appEventList.requestMovement,
        this.event_request_movement.bind(this),
      )
      .addEventListener(appEventList.killApp, this.event_kill_app.bind(this))
      .addEventListener(
        appEventList.refreshApp,
        this.event_refresh_app.bind(this),
      )
      .addEventListener(
        appEventList.minimiseWindow,
        this.event_minimise_windows.bind(this),
      )
      .addEventListener(
        appEventList.settingsUpdated,
        this.event_settings_updated.bind(this),
      )
      .addEventListener(appEventList.edgeEnter, () => {
        // Seule la zone du bord gauche (mode souris) peut ouvrir la barre ainsi
        if ((this.settingUsesEdge || this.settingIsAutoHide) && !this.state)
          this.event_main_click();
      })
      .addEventListener(appEventList.requestToggle, () =>
        this.toggleFromOutside(),
      )
      .addEventListener(appEventList.openSettings, () =>
        this.event_tray_on_click(),
      )
      .addEventListener(appEventList.tooltipShow, this.event_tooltip_show.bind(this))
      .addEventListener(appEventList.tooltipHide, () => this.hideTooltip())
      .addEventListener(appEventList.getSeasonInfo, () =>
        require('./src/scripts/Seasons.js').seasonInfo(),
      )
      .addEventListener(appEventList.getSavedUrls, () => this.event_get_saved_urls())
      .addEventListener(appEventList.getVersion, () => app.getVersion())
      .addEventListener(appEventList.updateGetState, () => AppMain.updater.state)
      .addEventListener(appEventList.updateCheck, () => AppMain.updater.check())
      .addEventListener(appEventList.updateCheckTest, () =>
        AppMain.updater.checkTest(),
      )
      .addEventListener(appEventList.updateInstallTest, () =>
        AppMain.updater.installTest(),
      )
      .addEventListener(appEventList.permissionsList, () =>
        AppMain.permissions.list(),
      )
      .addEventListener(appEventList.permissionRevoke, (_, decision) => {
        AppMain.permissions.revoke(decision?.origin, decision?.permission);
        return AppMain.permissions.list();
      })
      .addEventListener(appEventList.permissionsClear, () => {
        AppMain.permissions.clear();
        return AppMain.permissions.list();
      })
      .addEventListener(appEventList.updateInstall, () => AppMain.updater.install())
      .addEventListener(appEventList.isAppBarSupported, () => isAppBarSupported())
      .addEventListener(appEventList.getDisplays, () => this.getDisplaysInfo())
      .addEventListener(appEventList.toggleMute, this.event_toggle_mute.bind(this))
      .addEventListener(
        appEventList.mediaControl,
        this.event_media_control.bind(this),
      )
      .addEventListener(appEventList.mediaHover, this.event_media_hover.bind(this));

    // Envoyé par le preload des sites (pas par nos pages locales)
    ipcMain.on(internalChannels.mediaState, this.event_media_state.bind(this));

    // Traductions demandées (de façon synchrone) par le preload de nos pages
    ipcMain.on(internalChannels.i18n, (event) => {
      const frame = event.senderFrame;
      event.returnValue =
        frame && frame === event.sender.mainFrame && frame.url.startsWith('file://')
          ? { locale: getLocale(), dict: getDictionary() }
          : {};
    });

    for (const eventName of [
      'display-metrics-changed',
      'display-added',
      'display-removed',
    ])
      screen.on(eventName, () => this.repositionWindows());

    if (this.settingUsesEdge) this.startDetectMousePosition();
    // Barre ancrée fixe : dépliée dès le démarrage
    if (this.settingIsAppBar) {
      if (!this.settingIsAutoHide) this.event_main_click();
      else this.updateDock();
    }
  }

  /**
   * Met à jour la barre ancrée : rail replié ou barre dépliée.
   */
  updateDock() {
    if (this.settingIsAppBar) this.updateRail();
  }

  /**
   * Replie la barre en rail fin (ou la restaure) : le rail est la barre réduite
   * à une bande, qui garde sa place si elle n'est pas en masquage automatique.
   */
  updateRail() {
    this.bindToolbarInit();

    const rail = !this.state;

    // Réserve (ou met à jour) l'espace avant de replacer les fenêtres : le rail
    // ne doit jamais recouvrir les autres fenêtres
    if (rail) this.attachAppBar();
    this.repositionWindows();

    const toolbar = this.toolbarWindow;
    if (rail && !toolbar.isVisible()) toolbar.showInactive();

    this.syncToolbarClasses();
  }

  /**
   * Indique à la page de la barre si elle est réduite au rail.
   */
  syncToolbarClasses() {
    const rail = this.settingIsAppBar && !this.state;

    this.toolbarWindow.webContents
      .executeJavaScript(
        `document.documentElement.classList.toggle('rail', ${rail})`,
      )
      .catch(() => {});
  }

  /**
   * Charge les applications dans la barre dès que sa page est prête (une
   * seule fois par fenêtre).
   */
  bindToolbarInit() {
    if (this.toolbarDomReadyBound) return;
    this.toolbarDomReadyBound = true;

    this.toolbarWindow.webContents.addListener('dom-ready', async () => {
      this.syncToolbarClasses();

      if (this.started) return;
      this.started = true;

      const loaded = await this.load();
      this.toolbarWindow.webContents.postMessage(
        loaded ? pageEventList.init : 'init',
        {
          saves: loaded ? this.saves : [],
          settings: {
            isButton: this.settingIsButton,
          },
        },
      );

      // La toolbar peut avoir été recréée alors que des sites tournent déjà
      for (const url of new Set([...Object.keys(this.views), ...this.mutedUrls]))
        this.sendIndicators(url);
    });
  }

  /**
   * En masquage automatique, replie la barre une fois la souris sortie de
   * toutes les fenêtres de l'interface.
   */
  startAutoHideWatch() {
    this.stopAutoHideWatch();
    if (!this.settingIsAutoHide) return;

    let outsideSince = null;

    this.autoHideTimer = setInterval(() => {
      const visibleBounds = ['toolbar', 'apps', 'add_dialog']
        .map((name) => this.getWindow(name))
        .filter((win) => win && !win.isDestroyed() && win.isVisible())
        .map((win) => win.getBounds());
      const inside = isPointInside(screen.getCursorScreenPoint(), visibleBounds);

      const step = stepAutoHide(outsideSince, inside, Date.now(), AUTOHIDE_DELAY);
      outsideSince = step.outsideSince;
      if (step.collapse && this.state) this.event_main_click();
    }, AUTOHIDE_POLL);
  }

  stopAutoHideWatch() {
    clearInterval(this.autoHideTimer);
    this.autoHideTimer = null;
  }

  /**
   * Réserve (ou met à jour) la bande du bord gauche auprès du système.
   * @param {boolean} [force=false] Redemander même si la zone n'a pas changé
   */
  dockToolbar(force = false) {
    if (!this.appBar?.registered) return;

    const wanted = dockRequest({
      bounds: this.primaryScreen.bounds,
      autoHide: this.settingIsAutoHide,
      dockedWidth: this.dockedWidth,
      railWidth: RAIL_WIDTH,
    });
    const key = dockRequestKey(wanted);

    // Évite de boucler : réserver l'espace modifie la zone de travail, ce qui
    // redéclenche repositionWindows
    if (!force && key === this.appBarKey) return;
    this.appBarKey = key;

    this.appBarRect = this.appBar.setPos(wanted) ?? this.appBarRect;
  }

  /**
   * Enregistre la barre comme AppBar et la place.
   */
  attachAppBar() {
    this.appBar ??= createAppBar({
      onFullscreen: (isFullscreen) =>
        this.getWindow('toolbar')?.setAlwaysOnTop(!isFullscreen),
      onPosChanged: () => {
        this.dockToolbar(true);
        this.repositionWindows();
      },
    });

    if (!this.appBar.register(this.toolbarWindow)) return;

    this.dockToolbar(true);
    this.repositionWindows();
  }

  /**
   * Libère l'espace réservé par la barre ancrée.
   */
  detachAppBar() {
    this.appBar?.unregister();
    this.appBarKey = null;
    this.appBarRect = null;
  }

  /**
   * Affiche ou cache la barre depuis le clavier ou la zone de notification.
   * En mode bouton, on passe par le bouton pour que son état reste cohérent.
   */
  toggleFromOutside() {
    const opening = !this.state;

    if (this.settingIsButton)
      this.mainWindow.webContents.postMessage(pageEventList.toolbarClosed, true);
    else this.event_main_click();

    // Au clavier, la barre doit recevoir le focus pour réagir à Échap
    if (opening) this.toolbarWindow.focus();
  }

  /**
   * Disposition des fenêtres sur l'écran choisi (coordonnées en pixels
   * indépendants de la densité, comme toute l'API de fenêtres d'Electron).
   * @type {{main:Electron.Rectangle, toolbar:Electron.Rectangle, apps:Electron.Rectangle, addDialog:Electron.Rectangle, edge:Electron.Rectangle}}
   * @readonly
   */
  get layout() {
    return computeLayout({
      workArea: this.workArea,
      bounds: this.primaryScreen.bounds,
      sizes: {
        toolbarWidth: APPBAR_WIDTH,
        addDialogWidth: ADD_DIALOG_WIDTH,
        addDialogHeight: ADD_DIALOG_HEIGHT,
        edgeWidth: EDGE_WIDTH,
      },
      docked: this.settingIsAppBar,
      dockedWidth: this.dockedWidth,
      grantedArea: this.appBarRect,
      buttonMode: this.settingIsButton,
    });
  }

  /**
   * Affiche la zone sensible du bord gauche (mode souris).
   */
  startDetectMousePosition() {
    if (!this.settingUsesEdge) return;

    const edge = this.edgeWindow;
    this.moveWindow(edge, this.layout.edge);
    edge.showInactive();
  }

  /**
   * Cache la zone sensible du bord gauche.
   */
  stopDetectMousePosition() {
    const edge = this.getWindow('edge');
    if (edge && !edge.isDestroyed()) edge.hide();
  }

  /**
   * Déplace et redimensionne une fenêtre, y compris vers un écran dont
   * l'échelle d'affichage est différente (sous Windows, Electron convertit
   * alors la taille avec l'échelle de l'ancien écran : on réapplique donc les
   * dimensions une fois la fenêtre sur le nouvel écran).
   * @param {?BaseWindow} win
   * @param {Electron.Rectangle} bounds
   */
  moveWindow(win, bounds) {
    if (!win || win.isDestroyed()) return;

    const target = screen.getDisplayMatching(bounds);
    const current = screen.getDisplayMatching(win.getBounds());

    win.setBounds(bounds);
    if (target.scaleFactor !== current.scaleFactor) win.setBounds(bounds);
  }

  /**
   * Replace les fenêtres existantes quand la configuration des écrans change.
   */
  repositionWindows() {
    this.dockToolbar();
    const layout = this.layout;

    for (const name of ['main', 'toolbar', 'apps', 'edge'])
      this.moveWindow(this.getWindow(name), layout[name]);

    // La fenêtre d'ajout est un dialogue : on la replace sans la redimensionner
    // si l'utilisateur a changé sa taille
    const addDialog = this.getWindow('add_dialog');
    if (addDialog && !addDialog.isDestroyed()) {
      const { width, height } = addDialog.getBounds();
      this.moveWindow(addDialog, {
        ...layout.addDialog,
        width: Math.min(width, layout.addDialog.width * 2),
        height: Math.min(height, this.workArea.height),
      });
    }

    this.hideMediaPopup();
  }

  initContextMenu() {
    this.contextMenu = new ContextMenuController({
      isToolbarWindow: (id) => id === this.getWindow('toolbar')?.id,
      isMuted: (url) => this.mutedUrls.has(url),
      translate: t,
    });
    startContextMenu(this.contextMenu);

    return this;
  }

  initTray() {
    let menu = [
      {
        label: t('tray.toggle'),
        accelerator: TOGGLE_SHORTCUT,
        registerAccelerator: false, // enregistré globalement par ailleurs
        click: () => this.toggleFromOutside(),
      },
      {
        label: t('tray.settings'),
        click: this.event_tray_on_click.bind(this),
      },
      {
        label: t('tray.quit'),
        click: app.quit.bind(app),
      },
    ];

    if (AppMain.IsDev) {
      menu.splice(0, 0, {
        label: '[DEBUG]Ouvrir une console',
        click: () => {
          const windows = BrowserWindow.getAllWindows().map((x) => {
            return {
              label: x.title,
              click: function (id) {
                BrowserWindow.fromId(id).webContents.openDevTools();
              }.bind(this, x.id),
            };
          });
          const devMenu = Menu.buildFromTemplate(windows);
          this.tray.popUpContextMenu(devMenu);
        },
      });
    }

    const appContextMenu = Menu.buildFromTemplate(menu);

    this.tray = new Tray(this.trayIconFor(this.updateLevel));
    this.tray.setToolTip(this.trayTooltipFor(t('tray.tooltip')));
    this.tray.setContextMenu(appContextMenu);
    this.tray.on('click', () => this.toggleFromOutside());

    return this;
  }

  /**
   * Niveau d'alerte de mise à jour : `null` (rien), `pending` (nouvelle version
   * disponible ou en cours de téléchargement) ou `ready` (prête à installer).
   * @returns {?('pending'|'ready')}
   */
  get updateLevel() {
    return updateLevelOf(AppMain.updater?.state.etat);
  }

  /**
   * Icône de la zone de notification avec un point de couleur en bas à droite :
   * bleu (version disponible) ou vert (mise à jour prête).
   * @param {?('pending'|'ready')} level
   * @returns {Electron.NativeImage|string}
   */
  trayIconFor(level) {
    if (!level) return this.trayIcon;

    this.trayIconCache ??= {};
    if (this.trayIconCache[level]) return this.trayIconCache[level];

    const size = 32;
    const base = nativeImage
      .createFromPath(this.appIcon)
      .resize({ width: size, height: size });
    const bitmap = paintUpdateBadge(
      Buffer.from(base.toBitmap()),
      size,
      level,
      badgeCornerFor(isPrerelease(app.getVersion())),
    );

    return (this.trayIconCache[level] = nativeImage.createFromBitmap(bitmap, {
      width: size,
      height: size,
    }));
  }

  /**
   * @param {string} text Info-bulle de base
   * @returns {string} L'info-bulle, complétée de l'état de la mise à jour
   */
  trayTooltipFor(text) {
    const state = AppMain.updater?.state;

    return buildTrayTooltip({
      text,
      update: state
        ? {
            prerelease: state.prerelease,
            versionActuelle: state.versionActuelle,
            versionDisponible: state.versionDisponible,
            level: this.updateLevel,
          }
        : null,
      translate: t,
    });
  }

  /** Met à jour l'icône et l'info-bulle de la zone de notification. */
  refreshTrayUpdate() {
    if (!this.tray || this.tray.isDestroyed()) return;

    this.tray.setImage(this.trayIconFor(this.updateLevel));
    this.tray.setToolTip(this.trayTooltipFor(t('tray.tooltip')));
  }

  async save() {
    try {
      this.userFileData.save(this.saves);
    } catch (e) {
      console.error('Failed to save the file', e);
      dialog.showErrorBox(
        t('dialog.error'),
        t('dialog.saveFailed', { error: e.message }),
      );
    }
  }

  async load() {
    const data = await this.userFileData.loadAsync();

    if (data !== false) this.saves = data;

    return data !== false;
  }

  event_tray_on_click() {
    const existing = this.getWindow('settings');
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }

    let win = this.createBrowserWindow('settings', {
      title: t('window.settings'),
      icon: this.appIcon,
      width: 800,
      height: 810,
      useContentSize: true,
      preload: this.preloadPath, // path to your preload.js file
      file: path.join(__dirname, '/src/page.settings/settings.html'),
      show: false,
    });

    win.setMenuBarVisibility(false);

    win.addListener('closed', () => {
      this.removeWindow('settings');
    });

    win.webContents.executeJavaScript(`
            window.electron ??= {};
            window.electron.settings = {
             isButtonModeEnabled: ${this.settingIsButton}
            };

            if (!window.electron.settings) document.querySelector('html').classList.add('without-button');
            `);

    win.webContents.on('dom-ready', () => {
      win.webContents.postMessage(
        pageEventList.settingsStart,
        this.settings.filePath,
      );
    });

    win.show();

    this.settings.save();
  }

  async event_main_click() {
    this.state = !this.state;

    if (this.state) {
      clearTimeout(this.timeout);

      if (this.settingIsButton) this.mainWindow.setAlwaysOnTop(true);
      else this.stopDetectMousePosition();

      this.toolbarWindow.show();
      // En masquage automatique la barre flotte au-dessus des fenêtres, sans
      // réserver d'espace
      if (this.settingIsAppBar && !this.settingIsAutoHide) this.attachAppBar();
      this.startAutoHideWatch();

      this.bindToolbarInit();
    } else {
      this.appsWindow.hide();
      // Ancrée, la barre reste affichée mais réduite à un rail fin
      if (!this.settingIsAppBar) this.toolbarWindow.hide();
      this.hideMediaPopup();
      this.hideTooltip();
      this.toolbarWindow.webContents.postMessage(
        pageEventList.windowAppsClosed,
        true,
      );

      this.stopAutoHideWatch();
      if (!this.settingIsAppBar) this.detachAppBar();

      if (this.settingUsesEdge) {
        this.startDetectMousePosition();
      }
    }

    this.updateDock();
  }

  async event_toolbar_add_button_click(data = null) {
    this.toolbarWindow.webContents.postMessage(
      pageEventList.windowAppsClosed,
      true,
    );
    // this.toolbarWindow.hide();
    // this.mainWindow.hide();

    this.addDialogWindow.setMenuBarVisibility(false);
    this.addDialogWindow.once('closed', () => {
      // app.quit();
      this.toolbarWindow.show();
      this.toolbarWindow.webContents.postMessage(
        pageEventList.appEdited,
        false,
      );

      if (this.settingIsButton) this.mainWindow.show();
    });

    this.toolbarWindow.webContents.postMessage(pageEventList.appEdited, true);

    if (data?.url) {
      this.addDialogWindow.loadFile(
        path.join(__dirname, '/src/page.add/edit.html'),
      );
      this.addDialogWindow.title = t('window.edit');
      this.addDialogWindow.webContents.on('dom-ready', () => {
        this.addDialogWindow.webContents.postMessage(
          pageEventList.modeEdit,
          data,
        );
      });
    } else
      this.addDialogWindow.loadFile(
        path.join(__dirname, '/src/page.add/add.html'),
      );

    this.addDialogWindow.show();
  }

  /**
   * Adresses des applications déjà dans la barre (pour marquer « Ajouté »).
   * @returns {string[]}
   */
  event_get_saved_urls() {
    return savedUrls(this.saves);
  }

  /**
   * Ajoute une application depuis la fenêtre d'ajout, qui reste ouverte.
   * @returns {boolean} `true` si l'application est dans la barre (ajoutée ou déjà présente)
   */
  event_request_add_data(_, data) {
    const clean = sanitizeAppData(data);
    if (!clean) return false;

    if (this.saves.some((save) => save?.url === clean.url)) return true;

    this.toolbarWindow.webContents.postMessage(pageEventList.appAdded, clean);

    this.saves.push(clean);
    this.save();

    return true;
  }

  event_request_add_separator(_, data) {
    const url = data;
    const insertion = insertSeparatorAfter(this.saves, url);

    if (insertion?.kind === 'appended') {
      this.toolbarWindow.webContents.postMessage(
        pageEventList.appAdded,
        'separator',
      );
    } else if (insertion) {
      this.toolbarWindow.webContents.postMessage(pageEventList.appInserted, {
        url,
        index: insertion.index,
        data: 'separator',
      });
    }

    if (insertion) this.saves = [...insertion.list];

    this.save();
    this.toolbarWindow.focus();
  }

  event_request_add_data_edit(_, data) {
    const clean = sanitizeAppData(data);
    if (!clean) return;

    this.removeWindow('add_dialog');
    this.toolbarWindow.webContents.postMessage(pageEventList.appAdded, clean);

    this.saves.push(clean);
    this.save();
    this.event_toolbar_add_button_click({
      ...clean,
      index: this.saves.length - 1,
    });
  }

  event_request_updated_data(_, data) {
    const clean = sanitizeAppData(data);
    const id = data?.id;
    // Un séparateur est une chaîne : on ne modifie que de vraies applications
    const replaced = clean ? replaceApp(this.saves, id, clean) : null;

    if (!clean || !replaced) return;

    this.removeWindow('add_dialog');

    const { oldLink } = replaced;
    this.saves = [...replaced.list];

    this.toolbarWindow.webContents.postMessage(pageEventList.appUpdated, {
      ...clean,
      id,
      oldLink,
    });

    this.save();
  }

  event_close_app() {
    this.appsWindow.hide();
    this.toolbarWindow.webContents.postMessage(
      pageEventList.windowAppsClosed,
      true,
    );
  }

  event_close_frame(_, url) {
    if (this.views?.[url]?.view) {
      this.views[url].view.setVisible(false);
      this.views[url].visible = false;
    }

    let loaded = false;

    for (const key in this.views) {
      const element = this.views[key];

      if (element.visible) {
        loaded = true;
        break;
      }
    }

    if (!loaded) this.appsWindow.hide();
  }

  /**
   * Suit le titre (non-lus) et l'état audio d'une vue pour les afficher sur son bouton.
   * @param {string} url
   * @param {WebContentsView} view
   */
  bindIndicators(url, view) {
    const { webContents } = view;

    webContents.on('page-title-updated', (_, title) => {
      this.updateIndicators(url, { badge: parseUnreadCount(title) });
    });
    webContents.on('audio-state-changed', (event) => {
      this.updateIndicators(url, { audible: event.audible });
    });
  }

  /**
   * @param {string} url
   * @param {{badge?: number, audible?: boolean}} changes
   */
  updateIndicators(url, changes) {
    const entry = this.views[url];
    if (!entry) return;

    Object.assign(entry, changes);
    this.sendIndicators(url);
  }

  sendIndicators(url) {
    this.postIndicators(url);
    this.pushMediaState(url);
    this.updateTaskbar();
  }

  postIndicators(url) {
    const entry = this.views[url];
    const toolbar = this.getWindow('toolbar');

    if (toolbar && !toolbar.isDestroyed())
      toolbar.webContents.postMessage(pageEventList.appIndicators, {
        url,
        badge: entry?.badge ?? 0,
        audible: entry?.audible ?? false,
        muted: this.mutedUrls.has(url),
        cover: entry?.media?.artwork ?? null,
        progress: this.getMediaProgress(entry?.media),
        hasMedia: !!entry?.media,
        ignored: this.taskbarIgnored.has(url),
      });
  }

  /**
   * Reflète le premier morceau en cours dans l'infobulle de l'icône de la zone
   * de notification (un seul morceau affiché : les autres lecteurs sont ignorés).
   */
  updateTaskbar() {
    const { first, others } = splitTaskbarPlayers(
      Object.keys(this.views).filter((key) => this.views[key].media),
    );

    const previous = this.taskbarIgnored;
    this.taskbarIgnored = new Set(others);
    for (const key of changedIgnored(previous, this.taskbarIgnored))
      this.postIndicators(key);

    if (!this.tray || this.tray.isDestroyed()) return;

    if (!first) {
      this.tray.setToolTip(this.trayTooltipFor(t('tray.tooltip')));
      return;
    }

    this.tray.setToolTip(
      this.trayTooltipFor(
        describeNowPlaying(this.views[first].media, others.length, t),
      ),
    );
  }

  // #region Media
  /**
   * @param {?{duration: ?number, position: ?number}} media
   * @returns {?number} Avancée du morceau entre 0 et 1, `null` si inconnue
   */
  getMediaProgress(media) {
    return mediaProgress(media);
  }

  /**
   * @param {string} url
   * @returns {?Object} État affiché par la fenêtre de contrôle du morceau
   */
  getMediaPayload(url) {
    return mediaPayload(url, this.views[url]?.media, this.mutedUrls.has(url));
  }

  /**
   * Envoie un message à la fenêtre média, une fois sa page chargée.
   */
  sendToMediaWindow(channel, payload) {
    const win = this.mediaWindow;

    if (win.webContents.isLoading())
      win.webContents.once('did-finish-load', () =>
        win.webContents.postMessage(channel, payload),
      );
    else win.webContents.postMessage(channel, payload);
  }

  /**
   * Met à jour la fenêtre média si elle est affichée pour cette application.
   */
  pushMediaState(url) {
    if (this.mediaHoverUrl !== url) return;

    const win = this.getWindow('media');
    if (!win || !win.isVisible()) return;

    const payload = this.getMediaPayload(url);

    if (payload) this.sendToMediaWindow(pageEventList.mediaState, payload);
    else this.hideMediaPopup();
  }

  /**
   * @param {string} url
   * @param {number} centerY Milieu vertical du bouton dans la toolbar
   */
  showMediaPopup(url, centerY) {
    const payload = this.getMediaPayload(url);
    if (!payload) return;

    const toolbar = this.toolbarWindow.getBounds();
    const wa = this.workArea;
    const y = centeredTop(toolbar.y + centerY, MEDIA_POPUP_HEIGHT, wa);

    this.mediaHoverUrl = url;
    this.mediaWindow.setPosition(
      Math.round(toolbar.x + toolbar.width + 10),
      Math.round(y),
    );
    this.sendToMediaWindow(pageEventList.mediaState, payload);
    this.mediaWindow.showInactive();
  }

  hideMediaPopup() {
    clearTimeout(this.mediaHideTimer);
    this.mediaHoverUrl = null;

    const win = this.getWindow('media');
    if (win && win.isVisible()) win.hide();
  }

  /**
   * Reçoit le morceau en cours d'un site (depuis son preload).
   */
  event_media_state(event, raw) {
    if (event.senderFrame !== event.sender.mainFrame) return;

    const url = Object.keys(this.views).find((key) => {
      const { webContents } = this.views[key].view;
      return !webContents.isDestroyed() && webContents.id === event.sender.id;
    });

    if (url) this.updateIndicators(url, { media: sanitizeMediaState(raw) });
  }

  /**
   * Affiche l'infobulle à droite de la barre, centrée sur le bouton.
   * @param {*} _
   * @param {{text: string, badge: ?string, y: number}} args
   */
  event_tooltip_show(_, { text, badge, y } = {}) {
    if (typeof text !== 'string' || text === '' || typeof y !== 'number')
      return;

    const toolbar = this.toolbarWindow.getBounds();
    const wa = this.workArea;
    const top = centeredTop(toolbar.y + y, TOOLTIP_HEIGHT, wa);

    const win = this.tooltipWindow;
    win.setPosition(
      Math.round(toolbar.x + toolbar.width + 8),
      Math.round(top),
    );

    const payload = {
      text: text.slice(0, 200),
      badge: typeof badge === 'string' ? badge.slice(0, 10) : null,
    };
    const send = () =>
      win.webContents.postMessage(pageEventList.tooltipState, payload);
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();

    win.showInactive();
  }

  /**
   * Thème automatique : réévalue le thème de saison au réveil de veille et chaque minute
   * (dont minuit), et ne rediffuse que s'il a changé.
   */
  scheduleSeasonCheck() {
    this.lastEffectiveTheme = this.settings.effectiveTheme;

    const check = () => {
      if (this.settings.effectiveTheme !== this.lastEffectiveTheme)
        this.broadcastTheme();
    };

    setInterval(check, 60 * 1000).unref?.();
    powerMonitor.on('resume', check);
  }

  hideTooltip() {
    const win = this.getWindow('tooltip');
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
  }

  event_media_hover(_, { url, hovering, y } = {}) {
    clearTimeout(this.mediaHideTimer);

    if (hovering) {
      if (typeof url === 'string' && typeof y === 'number')
        this.showMediaPopup(url, y);
    } else
      this.mediaHideTimer = setTimeout(
        () => this.hideMediaPopup(),
        MEDIA_POPUP_HIDE_DELAY,
      );
  }

  event_media_control(_, { url, action } = {}) {
    const entry = this.views[url];
    if (!entry?.media || !MEDIA_ACTIONS.includes(action)) return;

    entry.view.webContents.send(internalChannels.mediaAction, action);

    // Retour immédiat : la page confirmera dans la seconde qui suit
    if (action === 'play' || action === 'pause') {
      entry.media.playing = action === 'play';
      this.pushMediaState(url);
    }
  }

  event_toggle_mute(_, { url } = {}) {
    if (!isSafeUrl(url)) return;

    const muted = !this.mutedUrls.has(url);
    if (muted) this.mutedUrls.add(url);
    else this.mutedUrls.delete(url);

    this.views[url]?.view.webContents.setAudioMuted(muted);
    this.sendIndicators(url);
  }
  // #endregion

  event_open_frame(_, url) {
    if (!isSafeUrl(url)) return;

    this.url = url;

    if (!this.views[url]) {
      // Session par défaut (persistante) : on ne vide jamais son stockage
      // Site tiers : bac à sable et isolation explicites (défauts d'Electron,
      // mais ici la frontière de sécurité de l'application).
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          preload: path.join(__dirname, './src/scripts/media/media-preload.js'),
        },
      });
      view.webContents.setAudioMuted(this.mutedUrls.has(url));
      const bounds = this.appsWindow.getBounds();
      view.setBounds({
        x: 0,
        y: APPS_HEADER_HEIGHT,
        width: bounds.width,
        height: Math.max(0, bounds.height - APPS_HEADER_HEIGHT),
      });

      hardenWebContents(view.webContents);

      this.views[url] = { view, badge: 0, audible: false };
      this.appsWindow.contentView.addChildView(view);
      this.bindIndicators(url, view);

      view.webContents.loadURL(url);
    } else {
      this.views[url].view.setVisible(true);
    }

    this.views[url].visible = true;

    this.appsWindow.show();

    this.appsWindow.contentView.children[0].webContents.postMessage(
      pageEventList.frameOpen,
      url,
    );
  }

  event_app_delete(_, url) {
    if (this.views[url]) {
      /**@type {WebContentsView} */
      const view = this.views[url].view;
      view.setVisible(false);
      this.appsWindow.contentView.removeChildView(view);
      view.webContents.stop();
      view.webContents.close();
      view.webContents?.destroy?.();
      delete this.views[url];
      this.sendIndicators(url);
    }

    this.toolbarWindow.webContents.postMessage(
      pageEventList.toolbarAppDeleted,
      url,
    );

    this.toolbarWindow.focus();

    const { list, removedSeparators } = removeApp(this.saves, url);
    for (const ref of removedSeparators)
      this.toolbarWindow.webContents.postMessage(
        pageEventList.toolbarAppSeparatorDelete,
        ref,
      );

    this.saves = [...list];

    this.save();
  }

  event_app_edit(_, data) {
    data.index = this.saves.findIndex((x) => x.url === data.url);
    this.event_toolbar_add_button_click(data);
  }

  event_timeout_stop() {
    if (this.state) return;

    this.mainWindow.setAlwaysOnTop(false);
    this.mainWindow.blur();

    this.timeout = setTimeout(() => {
      this.mainWindow.setAlwaysOnTop(true);
    }, 10000);
  }

  event_toggle_stop_top() {
    if (this.state) return;

    clearTimeout(this.timeout);

    this.mainWindow.setAlwaysOnTop(!this.mainWindow.isAlwaysOnTop());

    if (!this.mainWindow.isAlwaysOnTop()) this.mainWindow.blur();
  }

  event_request_movement(_, rawArgs) {
    const { url, type } = rawArgs ?? {};
    if (typeof url !== 'string' || !['up', 'down'].includes(type)) return;
    const args = { url, type };

    const moved = moveApp(this.saves, url, type);
    if (!moved) return;

    //On déplace l'élément
    this.toolbarWindow.webContents.postMessage(pageEventList.windowAppMovement, {
      ...args,
      modifier: moved.modifier,
    });

    //On supprime les separator en double
    for (const ref of moved.removedSeparators)
      this.toolbarWindow.webContents.postMessage(
        pageEventList.toolbarAppSeparatorDelete,
        ref,
      );

    this.saves = [...moved.list];

    //on sauvegarde
    this.save();

    this.toolbarWindow.focus();
  }

  event_kill_app(_, url, open = false) {
    if (this.views[url]) {
      /**@type {WebContentsView} */
      const view = this.views[url].view;
      view.setVisible(false);
      this.appsWindow.contentView.removeChildView(view);
      view.webContents.stop();
      view.webContents.close();
      view.webContents?.destroy?.();
      delete this.views[url];
      this.sendIndicators(url);
    }

    this.toolbarWindow.webContents.postMessage(
      pageEventList.windowAppsClosed,
      true,
    );

    if (open) {
      if (this.settingIsButton)
        this.mainWindow.webContents.postMessage(
          pageEventList.toolbarClosed,
          true,
        );
      else this.toolbarWindow.hide();

      if (isSafeUrl(url)) shell.openExternal(url);
    }
  }

  event_refresh_app(_, url) {
    /**
     * @type {WebContentsView | undefined}
     */
    const view = this.views[url]?.view;
    view?.webContents.reload();
  }

  event_minimise_windows(_, win) {
    switch (win) {
      case 'add':
        this.addDialogWindow.minimize();
        break;

      default:
        break;
    }
  }

  event_settings_updated(_, settings) {
    if (!settings || typeof settings !== 'object') return;

    const isButtonModeEnabled = settings.isButtonModeEnabled === true;
    const appBarEnabled = settings.appBarEnabled === true;
    const appBarAutoHide = settings.appBarAutoHide === true;
    const buttonModeUpdated =
      this.settings.isButtonModeEnabled !== isButtonModeEnabled ||
      this.settings.appBarEnabled !== appBarEnabled ||
      this.settings.appBarAutoHide !== appBarAutoHide;

    // Les setters valident les valeurs (thème en liste blanche, écran entier)
    this.settings.theme = settings.theme;
    this.settings.themeAuto = settings.themeAuto === true;
    this.settings.effetsSaison = settings.effetsSaison;
    this.settings.densiteEffets = settings.densiteEffets;
    this.settings.isButtonModeEnabled = isButtonModeEnabled;
    this.settings.appBarEnabled = appBarEnabled;
    this.settings.appBarAutoHide = appBarAutoHide;

    const previousDisplayId = this.settings.displayId;
    this.settings.displayId = settings.displayId;
    const displayUpdated = this.settings.displayId !== previousDisplayId;

    this.settings.save();

    if (displayUpdated) this.repositionWindows();

    this.broadcastTheme();

    if (buttonModeUpdated) {
      // Libère l'espace réservé avant de détruire la fenêtre qui le porte
      this.stopAutoHideWatch();
      this.detachAppBar();
      this.removeWindow('toolbar');
      this.removeWindow('main');
      this.toolbarDomReadyBound = false;
      this.started = false;
      this.state = false;

      if (this.settingIsButton) {
        this.mainWindow.show();
        this.stopDetectMousePosition();
      } else {
        this.getWindow('main')?.hide();

        if (this.settingIsAppBar && !this.settingIsAutoHide) {
          this.stopDetectMousePosition();
          this.event_main_click();
        } else if (this.settingUsesEdge) this.startDetectMousePosition();
        else this.stopDetectMousePosition();
      }

      this.updateDock();
    }
  }

  /**
   * Prépare le gestionnaire de mises à jour (Squirrel sous Windows/macOS,
   * vérification GitHub sous Linux). La vérification démarre dans `main()`.
   */
  static InitAutoUpdater() {
    const { feedUrl, testFeedUrl, releasesRepo } = require('./configs/appConfig.js');
    const mode = resolveUpdateMode({
      isDev: AppMain.IsDev,
      isPackaged: app.isPackaged,
      platform: process.platform,
      simulateRequested: process.env.RTB_UPDATE_SIMULATE === '1',
    });

    // Serveur Hazel normal (versions publiées) ou serveur de test (pré-versions seulement)
    const setFeed = createFeedSwitcher({
      stableUrl: feedUrl,
      testUrl: testFeedUrl,
      platform: process.platform,
      version: app.getVersion(),
      apply: (url) => autoUpdater.setFeedURL({ url }),
    });

    if (mode.squirrel && feedUrl) setFeed('stable');

    AppMain.updater = new UpdateManager({
      version: app.getVersion(),
      autoUpdater: mode.squirrel && feedUrl ? autoUpdater : null,
      setFeed,
      testFeed: !!testFeedUrl,
      releasesRepo,
      manual: mode.manual,
      simulate: mode.simulate,
      fetch: (url, init) => net.fetch(url, init),
      openExternal: (url) => {
        if (isSafeUrl(url)) shell.openExternal(url);
      },
      compareVersions,
      beforeInstall: () => {
        // Copie de sécurité des données avant l'installation
        backupUserData(app, dataDirectory());
        // Sauvegarde des sessions (logins) avant que l'app soit tuée
        flushSession(session.defaultSession);
      },
      onChange: (state) => {
        for (const name of ['settings', 'toolbar']) {
          const win = runningInstance?.getWindow(name);
          if (win && !win.isDestroyed())
            win.webContents.postMessage(pageEventList.updateState, state);
        }
        runningInstance?.refreshTrayUpdate();
      },
      notifyReady: () => AppMain.NotifyUpdate(),
    });

    return this;
  }

  /**
   * Notification système : une mise à jour est prête (ou disponible sous Linux).
   * Un clic ouvre les Paramètres, où se trouve le bouton.
   */
  static NotifyUpdate() {
    showUpdateNotification({
      Notification,
      translate: t,
      iconPath: path.join(
        __dirname,
        `/src/pictures/${iconBaseName(app.getVersion())}.png`,
      ),
      onClick: () => runningInstance?.event_tray_on_click(),
    });
  }

  /**
   * @type {boolean}
   * @readonly
   */
  static get IsDev() {
    if (AppMain.Run.isdev === null || AppMain.Run.isdev === undefined) {
      AppMain.Run.isdev = process.argv[2] === '--dev';
    }

    return AppMain.Run.isdev;
  }
}

// Le dossier userData ne doit jamais changer (sessions, cookies, localStorage)
pinUserData(app);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

/** @type {?AppMain} */
let runningInstance = null;

// Sans cela, l'espace réservé par la barre ancrée resterait occupé
app.on('before-quit', () => {
  runningInstance?.detachAppBar();
  flushSession(session.defaultSession);
  logCookieState(app, session.defaultSession, 'sortie');
});
app.on('will-quit', () => {
  runningInstance?.detachAppBar();
  globalShortcut.unregisterAll();
  flushSession(session.defaultSession);
});

app.on('ready', async () => {
  if (!hasSingleInstanceLock) return;
  try {
    migrateLegacyData(app, dataDirectory());
    restoreFromBackup(dataDirectory());
    keepLoginsAlive(session.defaultSession, app);
    const permissionFile = new JsonFileStore(dataDirectory(), 'permissions.rcft');
    AppMain.permissions = new PermissionStore({
      load: () => permissionFile.load(),
      save: (data) => permissionFile.save(data),
    });
    installPermissionHandlers(session.defaultSession, {
      store: AppMain.permissions,
      isSafeUrl,
      ask: createPermissionDialog({ dialog, translate: t }),
    });
    const instance = AppMain.InitAutoUpdater().Run();
    runningInstance = instance;

    // Raccourci clavier global : afficher ou cacher la barre
    if (!globalShortcut.register(TOGGLE_SHORTCUT, () => instance.toggleFromOutside()))
      console.warn(`Raccourci ${TOGGLE_SHORTCUT} indisponible (déjà utilisé ?)`);
  } catch (error) {
    console.error(error);
    const dialogOpts = {
      type: 'error',
      buttons: ['Ok'],
      title: 'App error',
      message: error.message,
      // detail: error.stack,
    };

    dialog.showMessageBox(dialogOpts);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
