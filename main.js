// Doit être exécuté en premier : évènements d'installation/mise à jour Squirrel
if (require('electron-squirrel-startup')) {
  require('electron').app.quit();
  return;
}

const {
  app,
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
const { appEventList } =require('./src/scripts/events/AppEventList.js');
const { pageEventList } = require('./src/scripts/events/PageEventList.js');
const {
  parseUnreadCount,
  sanitizeMediaState,
  MEDIA_ACTIONS,
} = require('./src/scripts/AppIndicators.js');

const MEDIA_POPUP_WIDTH = 300;
const MEDIA_POPUP_HEIGHT = 96;
const MEDIA_POPUP_HIDE_DELAY = 250;

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
  }

  get settingIsButton() {
    return this.settings.isButtonModeEnabled;
  }

  get theme() {
    return this.settings.theme;
  }

  get appIcon() {
    if (!this.main.icon)
      this.main.icon = path.join(__dirname, '/src/pictures/icon.png');

    return this.main.icon;
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
        width: 64,
        height: 32,
        x: this.workArea.x + 10,
        y: this.workArea.y + this.workArea.height - 32,
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
        width: 64,
        height: this.workArea.height - (this.settingIsButton ? 52 : 20),
        x: this.workArea.x + 10,
        y: this.workArea.y + 10,
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
   * @type {BrowserWindow}
   * @readonly
   */
  get addDialogWindow() {
    if (!this.getWindow('add_dialog')) {
      // app.files =
      //   fs.readFileSync('./configs/config.json')?.toString?.() ?? 'null';
      const win = this.createBrowserWindow('add_dialog', {
        title: 'Ajouter une application',
        width: this.workArea.width / 4,
        height: this.toolbarWindow.getBounds().height / 2,
        y: this.toolbarWindow.getBounds().y,
        x:
          this.toolbarWindow.getBounds().x +
          this.toolbarWindow.getBounds().width +
          10,
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

  get appsWindow() {
    let win = this.getWindow('apps');

    if (!win) {
      win = new BaseWindow({
        width: this.workArea.width / 4,
        height: this.toolbarWindow.getBounds().height,
        x: this.workArea.x + 64 + 20,
        y: this.workArea.y + 10,
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
            y: i === 0 ? 0 : 20,
            width: this.appsWindow.getBounds().width,
            height: i === 0 ? 20 : this.appsWindow.getBounds().height,
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
      view.setBounds({ x: 0, y: 0, width: win.getBounds().width, height: 20 });
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
      .addEventListener(appEventList.getVersion, () => app.getVersion())
      .addEventListener(appEventList.getDisplays, () => this.getDisplaysInfo())
      .addEventListener(appEventList.toggleMute, this.event_toggle_mute.bind(this))
      .addEventListener(
        appEventList.mediaControl,
        this.event_media_control.bind(this),
      )
      .addEventListener(appEventList.mediaHover, this.event_media_hover.bind(this));

    // Envoyé par le preload des sites (pas par nos pages locales)
    ipcMain.on('rtb-media-state', this.event_media_state.bind(this));

    for (const eventName of [
      'display-metrics-changed',
      'display-added',
      'display-removed',
    ])
      screen.on(eventName, () => this.repositionWindows());

    if (!this.settingIsButton) this.startDetectMousePosition();
  }

  startDetectMousePosition() {
    if (!this.mouseInterval) {
      this.mouseInterval = setInterval(() => {
        // Bord gauche de l'écran principal uniquement (pas d'un écran voisin)
        const { bounds } = this.primaryScreen;
        const cursor = screen.getCursorScreenPoint();
        if (
          cursor.x >= bounds.x &&
          cursor.x <= bounds.x + 10 &&
          cursor.y >= bounds.y &&
          cursor.y < bounds.y + bounds.height
        ) {
          clearInterval(this.mouseInterval);
          this.mouseInterval = null;
          this.event_main_click();
        }
      }, 100);
    }
  }

  /**
   * Replace les fenêtres existantes quand la configuration des écrans change.
   */
  repositionWindows() {
    const wa = this.workArea;
    const main = this.getWindow('main');
    const toolbar = this.getWindow('toolbar');
    const apps = this.getWindow('apps');

    if (toolbar && !toolbar.isDestroyed())
      toolbar.setBounds({
        x: wa.x + 10,
        y: wa.y + 10,
        width: 64,
        height: wa.height - (this.settingIsButton ? 52 : 20),
      });

    if (main && !main.isDestroyed())
      main.setBounds({
        x: wa.x + 10,
        y: wa.y + wa.height - 32,
        width: 64,
        height: 32,
      });

    if (apps && !apps.isDestroyed()) apps.setPosition(wa.x + 64 + 20, wa.y + 10);
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
        label: 'Paramètres',
        click: this.event_tray_on_click.bind(this),
      },
      {
        label: "Quitter l'application",
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

    this.tray = new Tray(this.appIcon);
    this.tray.setToolTip("Gérer la barre d'outils");
    this.tray.setContextMenu(appContextMenu);

    return this;
  }

  async save() {
    try {
      this.userFileData.save(this.saves);
    } catch (e) {
      console.error('Failed to save the file', e);
      dialog.showErrorBox(
        'Erreur',
        "Impossible de sauvegarder la liste des applications : " + e.message,
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
      title: 'Paramètres',
      icon: this.appIcon,
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

      this.toolbarWindow.show();

      if (!this.toolbarDomReadyBound) {
        this.toolbarDomReadyBound = true;
        this.toolbarWindow.webContents.addListener('dom-ready', async () => {
        if (!this.started) {
          this.started = true;
          if (await this.load()) {
            this.toolbarWindow.webContents.postMessage(pageEventList.init, {
              saves: this.saves,
              settings: {
                isButton: this.settingIsButton,
              },
            });
          } else {
            this.toolbarWindow.webContents.postMessage('init', {
              saves: [],
              settings: {
                isButton: this.settingIsButton,
              },
            });
          }

          // La toolbar peut avoir été recréée alors que des sites tournent déjà
          for (const url of new Set([...Object.keys(this.views), ...this.mutedUrls]))
            this.sendIndicators(url);
        }
        });
      }
    } else {
      this.appsWindow.hide();
      this.toolbarWindow.hide();
      this.hideMediaPopup();
      this.toolbarWindow.webContents.postMessage(
        pageEventList.windowAppsClosed,
        true,
      );

      if (!this.settingIsButton) {
        this.startDetectMousePosition();
      }
    }
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
      this.addDialogWindow.title = 'Modifier une application';
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
    this.removeWindow('add_dialog');
    this.toolbarWindow.webContents.postMessage(pageEventList.appAdded, data);

    this.saves.push(data);
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
    this.removeWindow('add_dialog');
    this.toolbarWindow.webContents.postMessage(pageEventList.appAdded, data);

    this.saves.push(data);
    this.save();
    data.index = this.saves.length - 1;
    this.event_toolbar_add_button_click(data);
  }

  event_request_updated_data(_, data) {
    this.removeWindow('add_dialog');
    const { id, name, url, picture } = data;

    data.oldLink = this.saves[id].url;

    this.saves[id].name = name;
    this.saves[id].url = url;
    this.saves[id].picture = picture;

    this.toolbarWindow.webContents.postMessage(pageEventList.appUpdated, data);

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
      });

    this.pushMediaState(url);
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
        y: 20,
        width: bounds.width,
        height: Math.max(0, bounds.height - 20),
      });

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
      this.appsWindow.contentView.removeChildView(this.views[url].view);
      delete this.views[url];
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

  event_request_movement(_, args) {
    const { url, type } = args;

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
    let buttonModeUpdated = false;
    if (this.settingIsButton !== settings.isButtonModeEnabled) {
      buttonModeUpdated = true;
    }

    this.settings.theme = settings.theme;
    this.settings.isButtonModeEnabled = settings.isButtonModeEnabled;

    const displayUpdated = this.settings.displayId !== (settings.displayId ?? null);
    this.settings.displayId = settings.displayId ?? null;

    this.settings.save();

    if (displayUpdated) this.repositionWindows();

    const css = this.update_root_css();
    this.mainWindow.webContents.insertCSS(css);
    this.toolbarWindow.webContents.insertCSS(css);

    if (buttonModeUpdated) {
      this.removeWindow('toolbar');
      this.removeWindow('main');
      this.started = false;
      this.state = false;

      if (this.settingIsButton) {
        this.mainWindow.show();
        clearInterval(this.mouseInterval);
      } else {
        this.mainWindow.hide();
        this.startDetectMousePosition();
      }
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
              buttons: ['Redémarrer', 'Plus tard'],
              title: 'Application Update',
              message:
                process.platform === 'win32' ? releaseNotes : releaseName,
              detail:
                "Une nouvelle version a été téléchargée. Vous pouvez redémarrer l'application pour appliquer les mises à jours.",
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
              title: 'Une nouvelle version a été téléchargée ! !',
              body: "Une nouvelle version est disponible et a été téléchargé ! Cliquez ici pour plus d'informations !",
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
            title: 'Une nouvelle version est disponible !',
            body: "Une nouvelle version est disponible et est entrain d'être téléchargée en arrière plan ! Vous serez prévenu quand le téléchargement sera fini.",
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

app.on('before-quit', () => flushSession(session.defaultSession));
app.on('will-quit', () => flushSession(session.defaultSession));

app.on('ready', async () => {
  if (!hasSingleInstanceLock) return;
  try {
    const { FileData } = require('./src/scripts/FileData.js');
    migrateLegacyData(app, FileData.BasePath);
    restoreFromBackup(FileData.BasePath);
    keepLoginsAlive(session.defaultSession);
    AppMain.InitAutoUpdater().Run();
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
