import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, ipcMain, nativeTheme, screen, webContents } from 'electron';
import type { BaseWindow, Display, IpcMainInvokeEvent, Rectangle } from 'electron';
import { t } from '../../scripts/i18n.js';
import { isTrustedSender } from '../ipc/trustedSender.js';
import { getSettings } from '../settings/defaultSettings.js';
import type { Settings } from '../settings/Settings.js';
import { buildThemeScript } from '../theming/themeScript.js';
import { describeDisplays, pickDisplay } from './displays.js';
import type { DisplayInfo } from './displays.js';
import { WindowRegistry } from './WindowRegistry.js';
import { buildWindowConfig } from './windowConfig.js';
import type { WindowOptions } from './windowConfig.js';

const BASE_CSS_PATH = path.join(__dirname, '..', '..', 'css', 'app.css');

type IpcCallback = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Socle transitoire de `AppMain` : il assemble le registre des fenêtres, les écrans, le thème et
 * l'IPC. Chaque responsabilité vit dans son propre module (`WindowRegistry`, `displays`,
 * `windowConfig`, `trustedSender`, `themeScript`) ; cette classe ne fait que les câbler à Electron
 * et disparaîtra avec `AppMain` (composition root).
 */
export class BaseAppObject {
  /** Dernier thème appliqué, pour détecter un changement de saison. */
  lastEffectiveTheme: string | null = null;

  private readonly registry = new WindowRegistry<BaseWindow>();
  private baseCss: string | null = null;

  constructor() {
    this.init();
    this.main();
  }

  get settings(): Settings {
    return getSettings();
  }

  /** Écran choisi dans les paramètres, ou l'écran principal s'il n'existe plus. */
  get primaryScreen(): Display {
    return pickDisplay(screen.getAllDisplays(), this.settings.displayId, screen.getPrimaryDisplay());
  }

  /** Écrans disponibles, pour la page des paramètres. */
  getDisplaysInfo(): DisplayInfo[] {
    return describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id, t);
  }

  /** Zone utilisable (hors barre des tâches) de l'écran choisi, avec son origine. */
  get workArea(): Rectangle {
    return this.primaryScreen.workArea;
  }

  get primaryScreenSize(): Display['workAreaSize'] {
    return this.primaryScreen.workAreaSize;
  }

  /** Points d'extension appelés par le constructeur. */
  init(): void {}

  main(): void {}

  /** Script qui applique le thème courant sur la racine d'une page. */
  get themeScript(): string {
    return buildThemeScript({
      effectiveTheme: this.settings.effectiveTheme,
      effectsEnabled: this.settings.effetsSaison,
      effectsDensity: this.settings.densiteEffets,
      systemIsDark: nativeTheme.shouldUseDarkColors,
    });
  }

  /** Applique le thème courant à toutes les fenêtres ouvertes. */
  broadcastTheme(): void {
    this.lastEffectiveTheme = this.settings.effectiveTheme;
    const script = this.themeScript;

    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed() || !contents.getURL().startsWith('file://')) continue;
      contents.executeJavaScript(script).catch(console.error);
    }
  }

  /**
   * Applique le thème à chaque page locale de l'interface dès son chargement
   * (fenêtres, mais aussi vues intégrées comme celle de la fenêtre des applications).
   */
  applyThemeOnLoad(): void {
    app.on('web-contents-created', (_, contents) => {
      contents.on('dom-ready', () => {
        if (!contents.getURL().startsWith('file://')) return;
        contents.executeJavaScript(this.themeScript).catch(console.error);
      });
    });
  }

  /** Crée une fenêtre navigateur, la charge et l'enregistre sous ce nom. */
  createBrowserWindow(name: string, options: WindowOptions = {}): BrowserWindow {
    const win = new BrowserWindow(buildWindowConfig(name, options));

    if (options.file) win.loadFile(options.file).catch(console.error);

    // Injecté à chaque chargement de page : la fenêtre peut ne pas avoir de page à sa création
    win.webContents.on('dom-ready', () => {
      if (this.appCss !== '') win.webContents.insertCSS(this.appCss).catch(console.error);
    });

    this.addWindow(name, win);

    return win;
  }

  addWindow(name: string, window: BaseWindow): this {
    this.registry.add(name, window);
    return this;
  }

  getWindow(name: string): BaseWindow | undefined {
    return this.registry.get(name);
  }

  removeWindow(name: string): this {
    this.registry.remove(name);
    return this;
  }

  /** Écoute un canal IPC, réservé à la page principale des fenêtres locales. */
  addEventListener(name: string, callback: IpcCallback): this {
    ipcMain.handle(name, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) {
        console.warn(`IPC '${name}' refusé depuis`, event.senderFrame?.url);
        return undefined;
      }

      return callback(event, ...args);
    });

    return this;
  }

  /** Crée l'instance de la classe qui l'appelle. */
  static Run<T>(this: new () => T): T {
    return new this();
  }

  private get appCss(): string {
    this.baseCss ??= fs.readFileSync(BASE_CSS_PATH).toString();
    return this.baseCss;
  }
}
