/**
 * Construction des options d'une `BrowserWindow` à partir d'une description sans réglages de sécurité.
 *
 * Utilisé par `AppWindows` pour toutes les fenêtres de pages locales. Impose `nodeIntegration`
 * désactivé, `contextIsolation` et `sandbox` activés : une description ne peut pas les remplacer.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { BrowserWindowConstructorOptions } from 'electron';

/** Ce qu'une fenêtre de l'application peut choisir : jamais ses réglages de sécurité. */
export interface WindowOptions {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly show?: boolean;
  readonly alwaysOnTop?: boolean;
  readonly frame?: boolean;
  readonly useContentSize?: boolean;
  readonly resizable?: boolean;
  readonly transparent?: boolean;
  readonly skipTaskbar?: boolean;
  readonly minimizable?: boolean;
  readonly maximizable?: boolean;
  readonly icon?: string;
  /** Chemin du preload de la fenêtre. */
  readonly preload?: string;
  /** Page locale chargée à la création. */
  readonly file?: string;
  /** Autres options de fenêtre (`focusable`, `hasShadow`, `vibrancy`…), hors `webPreferences`. */
  readonly extra?: Omit<BrowserWindowConstructorOptions, 'webPreferences'>;
}

/**
 * Transforme la description d'une fenêtre en options Electron, avec des valeurs par défaut.
 * @param name Nom de la fenêtre, utilisé comme titre par défaut
 * @param options Description de la fenêtre
 * @returns Les options Electron : les réglages de sécurité (`nodeIntegration` désactivé,
 * `contextIsolation` et `sandbox` activés) sont imposés et ne peuvent pas être remplacés
 */
export function buildWindowConfig(name: string, options: WindowOptions = {}): BrowserWindowConstructorOptions {
  const {
    title = name,
    width = 800,
    height = 600,
    show = true,
    alwaysOnTop = false,
    frame = true,
    useContentSize = true,
    resizable = true,
    transparent = false,
    skipTaskbar = false,
    minimizable = true,
    maximizable = true,
    x,
    y,
    icon,
    preload,
    extra = {},
  } = options;

  return {
    title,
    width,
    height,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    show,
    alwaysOnTop,
    frame,
    useContentSize,
    transparent,
    skipTaskbar,
    minimizable,
    maximizable,
    ...(icon === undefined ? {} : { icon }),
    resizable,
    ...extra,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      ...(preload === undefined ? {} : { preload }),
    },
  };
}
