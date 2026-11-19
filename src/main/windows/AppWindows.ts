import fs from 'node:fs';
import { BaseWindow, BrowserWindow, WebContentsView } from 'electron';
import type { WebContents } from 'electron';
import type { Rect } from '../dock/dockGeometry.js';
import { WindowRegistry } from './WindowRegistry.js';
import { buildWindowConfig } from './windowConfig.js';
import type { WindowOptions } from './windowConfig.js';
import {
  addDialogWindowSpec,
  appsChildBounds,
  edgeWindowSpec,
  mainWindowSpec,
  mediaWindowSpec,
  settingsWindowSpec,
  toolbarWindowSpec,
  tooltipWindowSpec,
} from './windowSpecs.js';
import type { WindowSpecContext } from './windowSpecs.js';

export type WindowName = 'main' | 'toolbar' | 'media' | 'tooltip' | 'add_dialog' | 'edge' | 'apps' | 'settings';

export interface AppWindowsDeps {
  /** Ce dont les fenêtres ont besoin pour se décrire ; relu à chaque création (la disposition change). */
  readonly specContext: () => WindowSpecContext;
  /** Position de la fenêtre des applications. */
  readonly appsBounds: () => Rect;
  readonly preload: string;
  /** Page de l'en-tête de la fenêtre des applications. */
  readonly appsHeaderPage: string;
  /** Feuille de style de base, injectée dans chaque page chargée. */
  readonly baseCssPath: string;
  /** L'en-tête de la fenêtre des applications est chargé : il demande quelle application afficher. */
  readonly onAppsHeaderReady: (header: WebContents) => void;
}

/**
 * Les fenêtres de l'application : chacune est créée à la première demande, décrite par
 * `windowSpecs`, et oubliée quand elle est fermée ou détruite.
 */
export class AppWindows {
  private readonly registry = new WindowRegistry<BaseWindow>();
  private baseCss: string | null = null;

  constructor(private readonly deps: AppWindowsDeps) {}

  /** @returns La fenêtre si elle est ouverte, `undefined` sinon */
  get(name: WindowName): BaseWindow | undefined {
    return this.registry.get(name);
  }

  /** @returns La fenêtre navigateur si elle est ouverte, `undefined` sinon */
  getBrowser(name: Exclude<WindowName, 'apps'>): BrowserWindow | undefined {
    const window = this.registry.get(name);
    return window instanceof BrowserWindow ? window : undefined;
  }

  /** Ferme la fenêtre si elle est ouverte, puis l'oublie. */
  remove(name: WindowName): void {
    this.registry.remove(name);
  }

  /** @returns Les limites des fenêtres visibles parmi celles-ci */
  visibleBounds(names: readonly WindowName[]): Rect[] {
    return names
      .map((name) => this.registry.get(name))
      .filter((window): window is BaseWindow => !!window && window.isVisible())
      .map((window) => window.getBounds());
  }

  /** Bouton qui ouvre la barre (mode bouton). */
  get main(): BrowserWindow {
    return this.getBrowser('main') ?? this.create('main', mainWindowSpec(this.deps.specContext()));
  }

  get toolbar(): BrowserWindow {
    return this.getBrowser('toolbar') ?? this.create('toolbar', toolbarWindowSpec(this.deps.specContext()));
  }

  get media(): BrowserWindow {
    return this.getBrowser('media') ?? this.create('media', mediaWindowSpec(this.deps.specContext()));
  }

  get tooltip(): BrowserWindow {
    const existing = this.getBrowser('tooltip');
    if (existing) return existing;

    const window = this.create('tooltip', tooltipWindowSpec(this.deps.specContext()));
    // Ne capte jamais la souris : elle reste sur le bouton survolé
    window.setIgnoreMouseEvents(true);
    return window;
  }

  get addDialog(): BrowserWindow {
    return this.getBrowser('add_dialog') ?? this.create('add_dialog', addDialogWindowSpec(this.deps.specContext()));
  }

  /** Fine fenêtre collée au bord gauche : l'entrée de la souris ouvre la barre (mode souris). */
  get edge(): BrowserWindow {
    return this.getBrowser('edge') ?? this.create('edge', edgeWindowSpec(this.deps.specContext()));
  }

  /** Les paramètres : fenêtre créée cachée, à afficher une fois prête. */
  createSettings(): BrowserWindow {
    return this.create('settings', settingsWindowSpec(this.deps.specContext()));
  }

  /** Fenêtre qui porte les sites : un en-tête d'actions (rang 0), puis une vue par site. */
  get apps(): BaseWindow {
    return this.registry.get('apps') ?? this.createApps();
  }

  private create(name: Exclude<WindowName, 'apps'>, options: WindowOptions): BrowserWindow {
    const window = new BrowserWindow(buildWindowConfig(name, options));

    if (options.file) window.loadFile(options.file).catch(console.error);

    // Injecté à chaque chargement de page : la fenêtre peut ne pas avoir de page à sa création
    window.webContents.on('dom-ready', () => {
      if (this.css !== '') window.webContents.insertCSS(this.css).catch(console.error);
    });

    this.registry.add(name, window);
    return window;
  }

  private createApps(): BaseWindow {
    const window = new BaseWindow({
      ...this.deps.appsBounds(),
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      resizable: true,
      show: false,
    });

    window.on('resize', () => {
      const size = window.getBounds();
      window.contentView.children.forEach((view, index) => {
        if (view instanceof WebContentsView) view.setBounds(appsChildBounds(index, size));
      });
    });

    const header = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: this.deps.preload },
    });
    window.contentView.addChildView(header);
    header.webContents.loadFile(this.deps.appsHeaderPage).catch(console.error);
    header.setBounds(appsChildBounds(0, window.getBounds()));
    header.webContents.addListener('dom-ready', () => this.deps.onAppsHeaderReady(header.webContents));

    this.registry.add('apps', window);
    return window;
  }

  private get css(): string {
    this.baseCss ??= fs.readFileSync(this.deps.baseCssPath).toString();
    return this.baseCss;
  }
}
