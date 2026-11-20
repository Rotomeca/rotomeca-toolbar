/**
 * Création et suivi des fenêtres de l'application (barre, bouton, infobulles, paramètres, sites).
 *
 * Utilisé par `App` et les contrôleurs de la barre, des infobulles et du popup média ; s'appuie
 * sur `windowSpecs` pour décrire chaque fenêtre et sur `WindowRegistry` pour les retrouver.
 * Centralise la création pour que les réglages de sécurité et la feuille de style de base
 * s'appliquent partout de la même façon.
 */
// [node:fs] accès au système de fichiers (Node.js)
import fs from 'node:fs';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { BaseWindow, BrowserWindow, WebContentsView } from 'electron';
import type { WebContents } from 'electron';
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from '../dock/dockGeometry.js';
// [WindowRegistry.ts] Registre des fenêtres ouvertes, indexées par nom
import { WindowRegistry } from './WindowRegistry.js';
// [windowConfig.ts] Construction des options d'une `BrowserWindow` à partir d'une description sans réglages de sécurité
import { buildWindowConfig } from './windowConfig.js';
import type { WindowOptions } from './windowConfig.js';
// [windowSpecs.ts] Descriptions (taille, position, style, page) de chaque fenêtre de l'interface
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

/** Nom sous lequel chaque fenêtre de l'application est enregistrée. */
export type WindowName = 'main' | 'toolbar' | 'media' | 'tooltip' | 'add_dialog' | 'edge' | 'apps' | 'settings';

/** Ce dont `AppWindows` dépend, fourni par le processus principal. */
export interface AppWindowsDeps {
  /** Ce dont les fenêtres ont besoin pour se décrire ; relu à chaque création (la disposition change). */
  readonly specContext: () => WindowSpecContext;
  /** Position de la fenêtre des applications. */
  readonly appsBounds: () => Rect;
  /** Chemin du preload des pages locales. */
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

  /** @param deps Ce dont les fenêtres ont besoin (disposition, chemins, rappel de l'en-tête) */
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

  /** La barre des applications, créée à la première demande. */
  get toolbar(): BrowserWindow {
    return this.getBrowser('toolbar') ?? this.create('toolbar', toolbarWindowSpec(this.deps.specContext()));
  }

  /** Le popup de contrôle du morceau en cours, créé à la première demande. */
  get media(): BrowserWindow {
    return this.getBrowser('media') ?? this.create('media', mediaWindowSpec(this.deps.specContext()));
  }

  /** L'infobulle des boutons de la barre, créée à la première demande. */
  get tooltip(): BrowserWindow {
    const existing = this.getBrowser('tooltip');
    if (existing) return existing;

    const window = this.create('tooltip', tooltipWindowSpec(this.deps.specContext()));
    // Ne capte jamais la souris : elle reste sur le bouton survolé
    window.setIgnoreMouseEvents(true);
    return window;
  }

  /** La fenêtre « Ajouter une application », créée à la première demande. */
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

  /**
   * Crée une fenêtre de page locale, y charge sa page, lui injecte la feuille de style de base
   * et l'enregistre.
   * @param name Nom d'enregistrement
   * @param options Description de la fenêtre (les réglages de sécurité sont imposés)
   * @throws {Error} Si une fenêtre porte déjà ce nom
   */
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

  /**
   * Crée la fenêtre des applications : un en-tête d'actions (vue de rang 0) auquel s'ajoutent
   * les vues des sites ; toutes les vues suivent le redimensionnement de la fenêtre.
   */
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

  /** Feuille de style de base, lue une seule fois puis gardée en mémoire. */
  private get css(): string {
    this.baseCss ??= fs.readFileSync(this.deps.baseCssPath).toString();
    return this.baseCss;
  }
}
