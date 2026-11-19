import path from 'node:path';
import type { Layout, Rect } from '../dock/dockGeometry.js';
import type { WindowOptions } from './windowConfig.js';

// Dimensions fixes de l'interface (px)
/** Largeur de la barre dépliée. */
export const APPBAR_WIDTH = 72;
/**
 * Largeur du rail qui reste visible quand la barre est repliée, et place réservée à l'écran.
 * Windows impose 32 px au minimum à la fenêtre (vérifié) : la page dessine donc une bande
 * de 24 px et laisse les 8 px restants transparents.
 */
export const RAIL_WIDTH = 24;
/** Fenêtre « Ajouter une application » (contenu). */
export const ADD_DIALOG_WIDTH = 640;
export const ADD_DIALOG_HEIGHT = 760;
/** Bandeau d'actions au-dessus des applications. */
export const APPS_HEADER_HEIGHT = 32;
export const MEDIA_POPUP_WIDTH = 340;
export const MEDIA_POPUP_HEIGHT = 200;
/** Infobulle : fenêtre transparente sans clic, plus grande que son contenu. */
export const TOOLTIP_WIDTH = 320;
export const TOOLTIP_HEIGHT = 48;
/** Zone sensible au bord gauche de l'écran (mode souris). */
export const EDGE_WIDTH = 4;

const SETTINGS_WIDTH = 800;
const SETTINGS_HEIGHT = 810;

export interface WindowSpecContext {
  /** Dossier qui contient `index.html` et `src/` (la racine de l'application construite). */
  readonly appRoot: string;
  readonly preload: string;
  readonly appIcon: string;
  readonly layout: Layout;
  readonly translate: (key: string) => string;
}

const page = (context: WindowSpecContext, ...segments: string[]): string => path.join(context.appRoot, ...segments);

/** Fenêtre transparente, sans cadre, toujours au-dessus et hors de la barre des tâches. */
const overlay = { alwaysOnTop: true, frame: false, transparent: true, skipTaskbar: true, resizable: false } as const;

/** Petite fenêtre flottante qui ne prend jamais le focus. */
const popup = { ...overlay, minimizable: false, maximizable: false, show: false } as const;

/** Bouton qui ouvre la barre (mode bouton). */
export function mainWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    ...context.layout.main,
    ...overlay,
    useContentSize: true,
    preload: context.preload,
    file: page(context, 'index.html'),
  };
}

/** Barre des applications. */
export function toolbarWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    ...context.layout.toolbar,
    ...overlay,
    preload: context.preload,
    file: page(context, 'src', 'page.taskbar', 'taskbar.html'),
    show: false,
  };
}

/** Petite fenêtre affichée au survol d'un bouton qui joue un morceau. */
export function mediaWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    ...popup,
    width: MEDIA_POPUP_WIDTH,
    height: MEDIA_POPUP_HEIGHT,
    preload: context.preload,
    file: page(context, 'src', 'page.media', 'media.html'),
    extra: { focusable: false },
  };
}

/** Infobulle affichée à côté d'un bouton de la barre. */
export function tooltipWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    ...popup,
    width: TOOLTIP_WIDTH,
    height: TOOLTIP_HEIGHT,
    preload: context.preload,
    file: page(context, 'src', 'page.tooltip', 'tooltip.html'),
    extra: { focusable: false },
  };
}

/** Fenêtre « Ajouter une application ». */
export function addDialogWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    title: context.translate('window.add'),
    ...context.layout.addDialog,
    transparent: false,
    frame: true,
    alwaysOnTop: true,
    useContentSize: true,
    skipTaskbar: false,
    minimizable: true,
    maximizable: false,
    icon: context.appIcon,
    preload: context.preload,
    show: false,
    extra: { backgroundMaterial: 'acrylic' },
  };
}

/** Fine fenêtre quasi invisible collée au bord gauche : l'entrée de la souris ouvre la barre. */
export function edgeWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    ...context.layout.edge,
    ...popup,
    preload: context.preload,
    file: page(context, 'src', 'page.edge', 'edge.html'),
    extra: { focusable: false, hasShadow: false },
  };
}

export function settingsWindowSpec(context: WindowSpecContext): WindowOptions {
  return {
    title: context.translate('window.settings'),
    icon: context.appIcon,
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    useContentSize: true,
    preload: context.preload,
    file: page(context, 'src', 'page.settings', 'settings.html'),
    show: false,
  };
}

/** @returns La position d'une vue dans la fenêtre des applications : l'en-tête (rang 0) puis les sites */
export function appsChildBounds(index: number, windowSize: { readonly width: number; readonly height: number }): Rect {
  if (index === 0) return { x: 0, y: 0, width: windowSize.width, height: APPS_HEADER_HEIGHT };

  return { x: 0, y: APPS_HEADER_HEIGHT, width: windowSize.width, height: Math.max(0, windowSize.height - APPS_HEADER_HEIGHT) };
}
