const {
  app,
  BrowserWindow,
  WebContentsView,
  Tray,
  Menu,
  shell,
  screen,
  autoUpdater,
  Notification,
  dialog,
} = require('electron');

const path = require('path');
const { BaseAppObject } = require('./src/scripts/BaseAppObject.js');
const { BaseWindow } = require('electron/main');
const {
  JsEvent,
} = require('./lib/RotomecaWebComponents/libs/events_electron.js');
const { appEventList } = require('./src/scripts/events/AppEventList.js');
const { pageEventList } = require('./src/scripts/events/PageEventList.js');

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
        x: 10,
        y: this.primaryScreenSize.height - 32,
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
        height:
          this.primaryScreenSize.height - (this.settingIsButton ? 52 : 20),
        x: 10,
        y: 10,
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
   * @type {BrowserWindow}
   * @readonly
   */
  get addDialogWindow() {
    if (!this.getWindow('add_dialog')) {
      // app.files =
      //   fs.readFileSync('./configs/config.json')?.toString?.() ?? 'null';
      const win = this.createBrowserWindow('add_dialog', {
        title: 'Ajouter une application',
        width: this.primaryScreenSize.width / 4,
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
        width: this.primaryScreenSize.width / 4,
        height: this.toolbarWindow.getBounds().height,
        x: 64 + 20,
        y: 10,
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
      );

    if (!this.settingIsButton) this.startDetectMousePosition();
  }

  startDetectMousePosition() {
    if (!this.mouseInterval) {
      this.mouseInterval = setInterval(() => {
        if (screen.getCursorScreenPoint().x <= 10) {
          clearInterval(this.mouseInterval);
          this.mouseInterval = null;
          this.event_main_click();
        }
      }, 100);
    }
  }

  initContextMenu() {
    const { ContextMenu } = require('./src/scripts/ContextMenu.js');
    this.contextMenu = new ContextMenu();
    this.contextMenu.onShowCondition.push(
      (event, caller) =>
        caller.id === this.getWindow('toolbar')?.id &&
        event.target.nodeName === 'ROTOMECA-TOOLBAR-BUTTON',
    );
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
    const fs = require('fs');
    try {
      fs.writeFileSync('data.rsft', JSON.stringify(this.saves) /*, 'utf-8'*/);
      this.onsave.call(this.saves);
    } catch (e) {
      alert('Failed to save the file !');
    }
  }

  async load() {
    const fs = require('fs');
    let loaded = false;
    await new Promise((ok, nok) => {
      fs.readFile('data.rsft', 'utf-8', (err, data) => {
        if (!err) {
          try {
            this.saves = JSON.parse(data.toString());

            loaded = true;
          } catch (error) {
            this.saves ??= [];
          }
        }

        ok();
      });
    });

    this.onload.call(this.saves);

    return loaded;
  }

  event_tray_on_click() {
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
      win.webContents.postMessage('settingsStart', this.settings.filePath);
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
        }
      });
    } else {
      this.appsWindow.hide();
      this.toolbarWindow.hide();
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
    this.addDialogWindow.on('closed', () => {
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

    if (index !== null && index !== false) {
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
    if (
      !!this.views?.[url]?.index &&
      !!this.appsWindow.contentView.children[this.views[url].index]
    ) {
      this.appsWindow.contentView.children[this.views[url].index].setVisible(
        false,
      );

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

  event_open_frame(_, url) {
    this.url = url;

    if (!this.views[url]) {
      const view = new WebContentsView();
      view.setBounds({
        x: 0,
        y: 20,
        width: this.appsWindow.getBounds().width,
        height: this.appsWindow.getBounds().height,
      });

      this.views[url] = { view, index: Object.keys(this.views).length + 1 };
      this.appsWindow.contentView.addChildView(view, this.views[url].index);

      view.webContents.loadURL(url);
    } else {
      this.appsWindow.contentView.children[this.views[url].index].setVisible(
        true,
      );
    }

    this.views[url].visible = true;

    this.appsWindow.show();

    this.appsWindow.contentView.children[0].webContents.postMessage(
      pageEventList.frameOpen,
      url,
    );
  }

  event_app_delete(_, url) {
    if (!!this.views[url]) {
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
    if (!!this.views[url]) {
      /**@type {WebContentsView} */
      const view = this.views[url].view;
      view.setVisible(false);
      this.appsWindow.contentView.removeChildView(view);
      view.webContents.stop();
      view.webContents.close();
      view.webContents?.destroy?.();
      delete this.views[url];
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

      shell.openExternal(url);
    }
  }

  event_refresh_app(_, url) {
    /**
     * @type {WebContentsView}
     */
    const view = this.views[url].view;
    view.webContents.reload();
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

    this.settings.save();

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
    if (AppMain.IsDev) return this;

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
              if (returnValue.response === 0) autoUpdater.quitAndInstall();
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

app.on('ready', async () => {
  try {
    AppMain.InitAutoUpdater().Run();
  } catch (error) {
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
