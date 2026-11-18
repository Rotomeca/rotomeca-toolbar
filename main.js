// Doit être exécuté en premier : évènements d'installation/mise à jour Squirrel
if (require('electron-squirrel-startup')) {
  require('electron').app.quit();
  return;
}

const {
  app,
  nativeTheme,
  BrowserWindow,
  session,
  WebContentsView,
  Tray,
  Menu,
  shell,
  screen,
  autoUpdater,
  Notification,
  dialog,
  ipcMain,
  globalShortcut,
  net,
} = require('electron');

const path = require('path');
const { BaseAppObject } = require('./src/scripts/BaseAppObject.js');
const { BaseWindow } = require('electron/main');
const {
  JsEvent,
} = require('./lib/RotomecaWebComponents/libs/events_electron.js');
const {
  pinUserData,
  migrateLegacyData,
  backupUserData,
  restoreFromBackup,
  flushSession,
  keepLoginsAlive,
} = require('./src/scripts/Persistence.js');
const { appEventList } = require('./src/scripts/events/AppEventList.js');
const { t, getLocale, getDictionary } = require('./src/scripts/i18n.js');
const { pageEventList } = require('./src/scripts/events/PageEventList.js');
const { AppBar } = require('./src/scripts/AppBar.js');
const {
  parseUnreadCount,
  sanitizeMediaState,
  MEDIA_ACTIONS,
} = require('./src/scripts/AppIndicators.js');

// Largeur (px) de la bande réservée à la barre ancrée (AppBar)
const APPBAR_WIDTH = 72;

// Largeur (px) du rail qui reste visible quand la barre est repliée. Windows
// impose 32 px au minimum à une fenêtre : en dessous, elle dépasserait la place
// réservée.
const RAIL_WIDTH = 32;

// Barre ancrée en masquage automatique : délai (ms) avant de se replier une
// fois la souris sortie, et période (ms) de la surveillance du curseur
const AUTOHIDE_DELAY = 700;
const AUTOHIDE_POLL = 150;

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

// Intervalle (ms) entre deux vérifications de nouvelle version (Linux)
const MANUAL_UPDATE_INTERVAL = 6 * 60 * 60 * 1000;

// Taille maximale (caractères) d'une icône d'application encodée en data URL
const MAX_PICTURE_LENGTH = 2 * 1024 * 1024;

/**
 * @callback SavesUpdatedCallback
 * @param {Array<string, string | Object<string, *>>} saves
 * @return {void}
 */

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
    return this.settings.appBarEnabled && AppBar.isSupported;
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
      this.main.icon = path.join(__dirname, '/src/pictures/icon.png');

    return this.main.icon;
  }

  /**
   * Icône de la zone de notification : le .ico (16 à 256 px) reste net sous Windows.
   */
  get trayIcon() {
    return process.platform === 'win32'
      ? path.join(__dirname, '/src/pictures/icon.ico')
      : this.appIcon;
  }

  get preloadPath() {
    if (!this.main.preload)
      this.main.preload = path.join(__dirname, './preload.js');

    return this.main.preload;
  }

  /**
   * @type {FileData}
   * @readonly
   */
  get userFileData() {
    if (!this.main.userFileData) {
      const { FileData } = require('./src/scripts/FileData.js');
      let fd = new FileData('data.rsft');
      fd.onsave.push((data) => this.onsave.call(data));
      fd.onload.push((data) => this.onload.call(data || {}));
      this.main.userFileData = fd;
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
        nodeIntegration: false, // is default value after Electron v5
        contextIsolation: true, // protect against prototype pollution
        enableRemoteModule: false,
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
        nodeIntegration: false, // is default value after Electron v5
        contextIsolation: true, // protect against prototype pollution
        enableRemoteModule: false,
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
        otherArgs: { focusable: false },
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
        otherArgs: { focusable: false },
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
      const win = this.createBrowserWindow('add_dialog', {
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
        nodeIntegration: false, // is default value after Electron v5
        contextIsolation: true, // protect against prototype pollution
        enableRemoteModule: false,
        preload: this.preloadPath, // path to your preload.js file
        // file: path.join(__dirname, '/src/page.add/add.html'),
        show: false,
        otherArgs: {
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
        otherArgs: { focusable: false, hasShadow: false },
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
    /**
     * @type {JsEvent<SavesUpdatedCallback>}
     * @event
     */
    this.onsave = new JsEvent();
    /**
     * @type {JsEvent<SavesUpdatedCallback>}
     * @event
     */
    this.onload = new JsEvent();
  }

  main() {
    super.main();

    // « Système » : suit le mode clair/sombre de Windows en direct
    nativeTheme.on('updated', () => this.broadcastTheme());

    if (AppMain.hasAutoUpdater) AppMain.CheckForUpdate();

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
      .addEventListener(appEventList.getVersion, () => app.getVersion())
      .addEventListener(appEventList.isAppBarSupported, () => AppBar.isSupported)
      .addEventListener(appEventList.getDisplays, () => this.getDisplaysInfo())
      .addEventListener(appEventList.toggleMute, this.event_toggle_mute.bind(this))
      .addEventListener(
        appEventList.mediaControl,
        this.event_media_control.bind(this),
      )
      .addEventListener(appEventList.mediaHover, this.event_media_hover.bind(this));

    // Envoyé par le preload des sites (pas par nos pages locales)
    ipcMain.on('rtb-media-state', this.event_media_state.bind(this));

    // Traductions demandées (de façon synchrone) par le preload de nos pages
    ipcMain.on('rtb-i18n', (event) => {
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
      const point = screen.getCursorScreenPoint();
      const inside = ['toolbar', 'apps', 'add_dialog'].some((name) => {
        const win = this.getWindow(name);
        if (!win || win.isDestroyed() || !win.isVisible()) return false;

        const b = win.getBounds();
        return (
          point.x >= b.x &&
          point.x < b.x + b.width &&
          point.y >= b.y &&
          point.y < b.y + b.height
        );
      });

      if (inside) {
        outsideSince = null;
      } else if (outsideSince === null) {
        outsideSince = Date.now();
      } else if (Date.now() - outsideSince >= AUTOHIDE_DELAY) {
        outsideSince = null;
        if (this.state) this.event_main_click();
      }
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

    const { bounds } = this.primaryScreen;
    const wanted = {
      x: bounds.x,
      y: bounds.y,
      // En masquage automatique, seul le rail réserve de la place : la barre
      // dépliée flotte par-dessus les fenêtres sans les déplacer
      width: this.settingIsAutoHide ? RAIL_WIDTH : this.dockedWidth,
      height: bounds.height,
    };
    const key = JSON.stringify(wanted);

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
    this.appBar ??= new AppBar({
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
    const wa = this.workArea;
    const { bounds } = this.primaryScreen;
    const docked = this.settingIsAppBar;
    const toolbar = docked
      ? {
          ...(this.appBarRect ?? { x: bounds.x, y: wa.y, height: wa.height }),
          width: this.dockedWidth,
        }
      : {
          x: wa.x + 10,
          y: wa.y + 10,
          width: APPBAR_WIDTH,
          height: wa.height - (this.settingIsButton ? 52 : 20),
        };

    return {
      main: {
        x: wa.x + 10,
        y: wa.y + wa.height - 32,
        width: 64,
        height: 32,
      },
      toolbar,
      apps: {
        x: docked
          ? toolbar.x + toolbar.width + 10
          : wa.x + 64 + 20,
        y: docked ? toolbar.y + 10 : wa.y + 10,
        width: Math.round(wa.width / 4),
        height: docked ? toolbar.height - 20 : toolbar.height,
      },
      addDialog: {
        x: toolbar.x + toolbar.width + 10,
        y: toolbar.y,
        width: Math.round(wa.width / 4),
        height: Math.round(toolbar.height / 2),
      },
      edge: {
        x: bounds.x,
        y: bounds.y,
        width: EDGE_WIDTH,
        height: bounds.height,
      },
    };
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
    const { ContextMenu } = require('./src/scripts/ContextMenu.js');
    this.contextMenu = new ContextMenu();
    this.contextMenu.onShowCondition.push(
      (event, caller) =>
        caller.id === this.getWindow('toolbar')?.id &&
        event.target.nodeName === 'ROTOMECA-TOOLBAR-BUTTON',
    );
    this.contextMenu.isMuted = (url) => this.mutedUrls.has(url);
    this.onsave.push(this.contextMenu.getOnSaveCallback());
    this.onload.push(this.contextMenu.getOnLoadCallback());

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
          const menu = Menu.buildFromTemplate(windows);
          this.tray.popUpContextMenu(menu);
        },
      });
    }

    const appContextMenu = Menu.buildFromTemplate(menu);

    this.tray = new Tray(this.trayIcon);
    this.tray.setToolTip(t('tray.tooltip'));
    this.tray.setContextMenu(appContextMenu);
    this.tray.on('click', () => this.toggleFromOutside());

    return this;
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
      height: 640,
      useContentSize: true,
      nodeIntegration: false, // is default value after Electron v5
      contextIsolation: true, // protect against prototype pollution
      enableRemoteModule: false,
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

  event_request_add_data(_, data) {
    const clean = AppMain.SanitizeAppData(data);
    if (!clean) return;

    this.removeWindow('add_dialog');
    this.toolbarWindow.webContents.postMessage(pageEventList.appAdded, clean);

    this.saves.push(clean);
    this.save();
  }

  event_request_add_separator(_, data) {
    const url = data;

    const index = this.saves.findIndex((x) => x.url === url);

    if (index >= 0) {
      if (index + 1 >= this.saves.length) {
        this.toolbarWindow.webContents.postMessage(
          pageEventList.appAdded,
          'separator',
        );
        this.saves.push('separator');
      } else {
        this.toolbarWindow.webContents.postMessage(pageEventList.appInserted, {
          url,
          index,
          data: 'separator',
        });
        this.saves.splice(index + 1, 0, 'separator');
      }
    }

    this.save();
    this.toolbarWindow.focus();
  }

  event_request_add_data_edit(_, data) {
    const clean = AppMain.SanitizeAppData(data);
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
    const clean = AppMain.SanitizeAppData(data);
    const id = data?.id;
    const target = Number.isInteger(id) ? this.saves[id] : null;

    // Un séparateur est une chaîne : on ne modifie que de vraies applications
    if (!clean || !target || typeof target !== 'object') return;

    this.removeWindow('add_dialog');

    const oldLink = target.url;

    target.name = clean.name;
    target.url = clean.url;
    target.picture = clean.picture;

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
    const playing = Object.keys(this.views).filter(
      (key) => this.views[key].media,
    );
    const [first, ...others] = playing;

    const previous = this.taskbarIgnored;
    this.taskbarIgnored = new Set(others);
    for (const key of new Set([...previous, ...this.taskbarIgnored]))
      if (previous.has(key) !== this.taskbarIgnored.has(key))
        this.postIndicators(key);

    if (!this.tray || this.tray.isDestroyed()) return;

    if (!first) {
      this.tray.setToolTip(t('tray.tooltip'));
      return;
    }

    const media = this.views[first].media;
    const progress = this.getMediaProgress(media);
    const lines = [
      `${media.playing ? '▶' : '⏸'} ${[media.title, media.artist]
        .filter(Boolean)
        .join(' – ')}`,
    ];
    if (progress !== null) lines.push(`${Math.round(progress * 100)} %`);
    if (others.length)
      lines.push(t('tray.ignoredPlayers', { count: others.length }));

    this.tray.setToolTip(lines.join('\n'));
  }

  // #region Media
  /**
   * @param {?{duration: ?number, position: ?number}} media
   * @returns {?number} Avancée du morceau entre 0 et 1, `null` si inconnue
   */
  getMediaProgress(media) {
    return media?.duration ? media.position / media.duration : null;
  }

  /**
   * @param {string} url
   * @returns {?Object} État affiché par la fenêtre de contrôle du morceau
   */
  getMediaPayload(url) {
    const media = this.views[url]?.media;

    return media ? { url, ...media, muted: this.mutedUrls.has(url) } : null;
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
    const y = Math.min(
      Math.max(toolbar.y + centerY - MEDIA_POPUP_HEIGHT / 2, wa.y),
      wa.y + wa.height - MEDIA_POPUP_HEIGHT,
    );

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
    const top = Math.min(
      Math.max(toolbar.y + y - TOOLTIP_HEIGHT / 2, wa.y),
      wa.y + wa.height - TOOLTIP_HEIGHT,
    );

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

    entry.view.webContents.send('rtb-media-action', action);

    // Retour immédiat : la page confirmera dans la seconde qui suit
    if (action === 'play' || action === 'pause') {
      entry.media.playing = action === 'play';
      this.pushMediaState(url);
    }
  }

  event_toggle_mute(_, { url } = {}) {
    if (!AppMain.IsSafeUrl(url)) return;

    const muted = !this.mutedUrls.has(url);
    if (muted) this.mutedUrls.add(url);
    else this.mutedUrls.delete(url);

    this.views[url]?.view.webContents.setAudioMuted(muted);
    this.sendIndicators(url);
  }
  // #endregion

  event_open_frame(_, url) {
    if (!AppMain.IsSafeUrl(url)) return;

    this.url = url;

    if (!this.views[url]) {
      // Session par défaut (persistante) : on ne vide jamais son stockage
      const view = new WebContentsView({
        webPreferences: {
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

      AppMain.HardenWebContents(view.webContents);

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

    this.saves = this.saves.filter((x) => x.url !== url);

    let tmp = [];
    let corrector = 0;
    for (let index = 0, len = this.saves.length; index < len; ++index) {
      const element = this.saves[index];

      if (
        index + 1 < len &&
        element === 'separator' &&
        this.saves[index + 1] === 'separator'
      ) {
        this.toolbarWindow.webContents.postMessage(
          pageEventList.toolbarAppSeparatorDelete,
          this.saves[index - (1 + corrector)].url,
        );
        ++corrector;
        continue;
      } else {
        corrector = 0;
        tmp.push(element);
      }
    }

    this.saves = tmp;

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

    const index = this.saves.findIndex((x) => x.url === url);
    if (index < 0) return;
    const element = this.saves.splice(index, 1)[0];

    let modifier = 0;
    while (
      this.saves[type === 'up' ? index - modifier : index + modifier] ===
      'separator'
    ) {
      ++modifier;
    }

    this.saves.splice(
      type === 'up' ? index - (1 + modifier) : index + (1 + modifier),
      0,
      element,
    );

    args.modifier = modifier;

    //On déplace l'élément
    this.toolbarWindow.webContents.postMessage(
      pageEventList.windowAppMovement,
      args,
    );

    //On supprime les separator en double
    let tmp = [];
    let corrector = 0;
    for (let index = 0, len = this.saves.length; index < len; ++index) {
      const element = this.saves[index];

      if (index === 0 && element === 'separator') {
        this.toolbarWindow.webContents.postMessage(
          pageEventList.toolbarAppSeparatorDelete,
          0,
        );
        continue;
      }

      if (
        index + 1 < len &&
        element === 'separator' &&
        this.saves[index + 1] === 'separator'
      ) {
        this.toolbarWindow.webContents.postMessage(
          pageEventList.toolbarAppSeparatorDelete,
          this.saves[index - (1 + corrector)].url,
        );
        ++corrector;
        continue;
      } else {
        corrector = 0;
        tmp.push(element);
      }
    }

    this.saves = tmp;

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

      if (AppMain.IsSafeUrl(url)) shell.openExternal(url);
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

  static InitAutoUpdater() {
    // Squirrel n'existe que sur Windows/macOS et uniquement en version packagée
    if (
      AppMain.IsDev ||
      !app.isPackaged ||
      !['win32', 'darwin'].includes(process.platform)
    )
      return this;

    autoUpdater.on('error', (error) => {
      console.error('Auto update error', error);
    });

    const server = require('./configs/appConfig.js').feedUrl;

    if (server) {
      const url = `${server}/update/${process.platform}/${app.getVersion()}`;
      autoUpdater.setFeedURL({ url });
      this.InitAutoUpdater.hasAutoUpdater = true;
    }

    return this;
  }

  static CheckForUpdate() {
    if (AppMain.IsDev) return false;

    let checked = false;
    if (this.hasAutoUpdater) {
      autoUpdater.on(
        'update-downloaded',
        (event, releaseNotes, releaseName) => {
          const showDialogInfos = () => {
            const dialogOpts = {
              type: 'info',
              buttons: [t('update.restart'), t('update.later')],
              title: t('update.title'),
              message:
                process.platform === 'win32' ? releaseNotes : releaseName,
              detail: t('update.downloadedDetail'),
            };

            dialog.showMessageBox(dialogOpts).then((returnValue) => {
              if (returnValue.response === 0) {
                // Copie de sécurité des données avant l'installation
                try {
                  const { FileData } = require('./src/scripts/FileData.js');
                  backupUserData(app, FileData.BasePath);
                } catch (e) {
                  console.error(e);
                }
                // Sauvegarde des sessions (logins) avant que l'app soit tuée
                flushSession(session.defaultSession);
                autoUpdater.quitAndInstall();
              }
            });
          };

          if (Notification.isSupported()) {
            let notification = new Notification({
              title: t('update.downloadedNotifTitle'),
              body: t('update.downloadedNotifBody'),
              icon: path.join(__dirname, '/src/pictures/icon.png'),
              urgency: 'normal',
            });

            notification.on('click', () => {
              showDialogInfos();
            });

            notification.show();
          } else showDialogInfos();
        },
      );
      autoUpdater.on('update-available', () => {
        if (Notification.isSupported()) {
          new Notification({
            title: t('update.availableNotifTitle'),
            body: t('update.availableNotifBody'),
            icon: path.join(__dirname, '/src/pictures/icon.png'),
            urgency: 'normal',
          }).show();
        }
      });

      autoUpdater.checkForUpdates();
      checked = true;
    }

    return checked;
  }

  /**
   * @type {boolean}
   * @readonly
   */
  static IsSafeUrl(url) {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch (error) {
      return false;
    }
  }

  /**
   * Valide et nettoie les données d'une application reçues d'une page (IPC).
   * @param {unknown} data
   * @returns {{name:string, url:string, picture:?string}|null} null si invalide
   */
  static SanitizeAppData(data) {
    if (!data || typeof data !== 'object') return null;

    const { name, url, picture } = data;
    if (typeof url !== 'string' || !AppMain.IsSafeUrl(url)) return null;

    let cleanPicture = null;
    if (typeof picture === 'string' && picture !== '') {
      const isDataImage =
        /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|bmp);/i.test(
          picture,
        ) && picture.length <= MAX_PICTURE_LENGTH;
      const isFont = /^font:[\w-]{1,64}$/.test(picture);

      if (isDataImage || isFont) cleanPicture = picture;
    }

    return {
      name:
        typeof name === 'string' && name.trim() !== ''
          ? name.slice(0, 200)
          : url,
      url,
      picture: cleanPicture,
    };
  }

  /**
   * Restreint ce qu'un site tiers peut faire : popups, navigation et permissions.
   * @param {Electron.WebContents} contents
   */
  static HardenWebContents(contents) {
    // Popups : uniquement http(s) (ex. connexion OAuth), jamais d'autre schéma
    contents.setWindowOpenHandler(({ url }) => {
      if (!AppMain.IsSafeUrl(url)) return { action: 'deny' };

      return {
        action: 'allow',
        overrideBrowserWindowOptions: { autoHideMenuBar: true },
      };
    });

    // Les popups autorisées héritent des mêmes restrictions de navigation
    contents.on('did-create-window', (child) => {
      AppMain.HardenWebContents(child.webContents);
    });

    // Navigation : on bloque file:, javascript:, data:, etc.
    const blockUnsafeNavigation = (event, url) => {
      if (!AppMain.IsSafeUrl(url)) event.preventDefault();
    };
    contents.on('will-navigate', blockUnsafeNavigation);
    contents.on('will-redirect', blockUnsafeNavigation);

    // Pas de <webview> dans les sites tiers
    contents.on('will-attach-webview', (event) => event.preventDefault());
  }

  /**
   * Politique de permissions des sites tiers (session par défaut).
   * Les permissions sensibles (caméra/micro, localisation) demandent
   * une confirmation, mémorisée pour la durée de l'exécution.
   * @param {Electron.Session} ses
   */
  static InstallPermissionHandlers(ses) {
    const ALLOWED = new Set([
      'notifications',
      'fullscreen',
      'pointerLock',
      'clipboard-sanitized-write',
      'mediaKeySystem', // DRM (Spotify, Netflix...)
      'speaker-selection',
    ]);
    const ASK = new Set(['media', 'geolocation']);
    const LABELS = {
      media: 'permission.media',
      geolocation: 'permission.geolocation',
    };
    /** @type {Map<string, boolean>} */
    const decisions = new Map();

    const originOf = (url) => {
      try {
        return new URL(url).origin;
      } catch (error) {
        return null;
      }
    };

    ses.setPermissionCheckHandler((_, permission, requestingOrigin) => {
      if (ALLOWED.has(permission)) return true;
      if (ASK.has(permission))
        return decisions.get(`${requestingOrigin}|${permission}`) === true;
      return false;
    });

    ses.setPermissionRequestHandler(
      async (contents, permission, callback, details) => {
        if (ALLOWED.has(permission)) return callback(true);
        if (!ASK.has(permission)) return callback(false);

        const origin = originOf(details?.requestingUrl ?? contents?.getURL());
        if (!origin || !AppMain.IsSafeUrl(origin)) return callback(false);

        const key = `${origin}|${permission}`;
        if (!decisions.has(key)) {
          const { response } = await dialog.showMessageBox({
            type: 'question',
            buttons: [t('permission.allow'), t('permission.deny')],
            defaultId: 1,
            cancelId: 1,
            title: t('permission.title'),
            message: t('permission.message', {
              origin,
              action: t(LABELS[permission]),
            }),
          });
          decisions.set(key, response === 0);
        }

        callback(decisions.get(key));
      },
    );
  }

  /**
   * Compare deux versions `x.y.z`.
   * @param {string} a
   * @param {string} b
   * @returns {number} > 0 si `a` est plus récente que `b`
   */
  static CompareVersions(a, b) {
    const parse = (v) =>
      String(v)
        .replace(/^v/i, '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
    const left = parse(a);
    const right = parse(b);

    for (let i = 0; i < Math.max(left.length, right.length); ++i) {
      const diff = (left[i] ?? 0) - (right[i] ?? 0);
      if (diff !== 0) return diff;
    }

    return 0;
  }

  /**
   * Squirrel n'existe pas sous Linux : on vérifie la dernière version publiée
   * sur GitHub et on propose d'ouvrir la page de téléchargement. L'installation
   * d'un paquet deb ou rpm demande les droits administrateur, elle reste donc
   * à la charge de l'utilisateur.
   */
  static StartManualUpdateCheck() {
    const repo = require('./configs/appConfig.js').releasesRepo;
    if (AppMain.IsDev || !app.isPackaged || process.platform !== 'linux' || !repo)
      return;

    let notifiedVersion = null;

    const check = async () => {
      try {
        const response = await net.fetch(
          `https://api.github.com/repos/${repo}/releases/latest`,
          { headers: { Accept: 'application/vnd.github+json' } },
        );
        if (!response.ok) return;

        const release = await response.json();
        const version = String(release?.tag_name ?? '').replace(/^v/i, '');
        const page = String(release?.html_url ?? '');

        // N'ouvrir que la page des versions du dépôt, jamais une URL quelconque
        if (
          !/^\d+(\.\d+){0,2}$/.test(version) ||
          !page.startsWith(`https://github.com/${repo}/`) ||
          AppMain.CompareVersions(version, app.getVersion()) <= 0 ||
          notifiedVersion === version
        )
          return;

        notifiedVersion = version;

        const { response: choice } = await dialog.showMessageBox({
          type: 'info',
          buttons: [t('update.manualDownload'), t('update.later')],
          defaultId: 0,
          cancelId: 1,
          title: t('update.title'),
          message: t('update.manualMessage', {
            version,
            current: app.getVersion(),
          }),
          detail: t('update.manualDetail'),
        });

        if (choice === 0) shell.openExternal(page);
      } catch (error) {
        console.error('Manual update check failed', error);
      }
    };

    check();
    setInterval(check, MANUAL_UPDATE_INTERVAL).unref();
  }

  static get hasAutoUpdater() {
    return !!this.InitAutoUpdater.hasAutoUpdater;
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
});
app.on('will-quit', () => {
  runningInstance?.detachAppBar();
  globalShortcut.unregisterAll();
  flushSession(session.defaultSession);
});

app.on('ready', async () => {
  if (!hasSingleInstanceLock) return;
  try {
    const { FileData } = require('./src/scripts/FileData.js');
    migrateLegacyData(app, FileData.BasePath);
    restoreFromBackup(FileData.BasePath);
    keepLoginsAlive(session.defaultSession);
    AppMain.InstallPermissionHandlers(session.defaultSession);
    const instance = AppMain.InitAutoUpdater().Run();
    runningInstance = instance;
    AppMain.StartManualUpdateCheck();

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

    dialog.showMessageBox(dialogOpts).then((returnValue) => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
