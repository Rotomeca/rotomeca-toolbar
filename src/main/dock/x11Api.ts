/**
 * Appels natifs X11 de la barre ancrée Linux (propriétés EWMH `_NET_WM_STRUT*`) chargés via koffi.
 *
 * Utilisé par `createAppBar`. Seul fichier qui connaît `libX11` : hors Linux, sous Wayland, ou si
 * koffi ou `libX11` manquent, la barre ancrée est simplement indisponible.
 */
// [koffi] appels de fonctions natives (libX11)
import type * as Koffi from 'koffi';

/** Espace à réserver le long du bord gauche de l'écran, en pixels physiques. */
export interface LeftStrut {
  /** Distance entre le bord gauche de l'écran virtuel et le bord droit de la bande. */
  readonly width: number;
  /** Première ligne de la bande. */
  readonly startY: number;
  /** Dernière ligne de la bande. */
  readonly endY: number;
}

/** Les deux opérations dont la barre ancrée a besoin. */
export interface X11Api {
  /** Réserve la bande pour la fenêtre (`_NET_WM_STRUT_PARTIAL` et `_NET_WM_STRUT`). */
  setStrut(windowId: number, strut: LeftStrut): void;
  /** Libère la bande réservée par la fenêtre. */
  clearStrut(windowId: number): void;
}

/** Fonction qui charge le module natif koffi. */
export type KoffiLoader = () => typeof Koffi;

/** Variables d'environnement lues pour reconnaître une session X11. */
export type SessionEnv = Readonly<Record<string, string | undefined>>;

/** Atome prédéfini `XA_CARDINAL`. */
const XA_CARDINAL = 6;
/** Mode `PropModeReplace` de `XChangeProperty`. */
const PROP_MODE_REPLACE = 0;
/** Format 32 bits : X11 attend alors un tableau de `long` C. */
const FORMAT_32 = 32;

/** Chargeur de koffi par défaut, paresseux : koffi est un module natif qui ne doit se charger que si on en a besoin. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireKoffi: KoffiLoader = () => require('koffi') as typeof Koffi;

/**
 * Encode des valeurs 32 bits comme un tableau de `long` C, le format que `XChangeProperty` lit
 * pour une propriété de format 32 (8 octets par valeur sous Linux 64 bits).
 * @param values Valeurs de la propriété
 * @param wordSize Taille d'un `long` C en octets (4 ou 8)
 */
export function encodeCardinals(values: readonly number[], wordSize: number): Buffer {
  const buffer = Buffer.alloc(values.length * wordSize);
  values.forEach((value, index) => {
    if (wordSize >= 8) buffer.writeBigUInt64LE(BigInt(value), index * wordSize);
    else buffer.writeUInt32LE(value, index * wordSize);
  });
  return buffer;
}

/**
 * Valeurs de `_NET_WM_STRUT_PARTIAL` pour une bande au bord gauche : left, right, top, bottom,
 * left_start_y, left_end_y, puis les six bornes des autres bords (inutilisées).
 */
export function strutPartialValues({ width, startY, endY }: LeftStrut): number[] {
  return [width, 0, 0, 0, startY, endY, 0, 0, 0, 0, 0, 0];
}

/** Valeurs de `_NET_WM_STRUT` (ancienne forme, sans plage) : left, right, top, bottom. */
export function strutValues({ width }: LeftStrut): number[] {
  return [width, 0, 0, 0];
}

/**
 * Charge les fonctions natives de la barre ancrée. Seul endroit qui connaît koffi et libX11.
 * @param platform Plateforme courante : Linux uniquement
 * @param env Variables d'environnement de la session
 * @param loadKoffi Chargeur de koffi, remplaçable dans les tests
 * @returns `null` hors Linux, hors session X11 (Wayland), ou si koffi / libX11 ne se chargent pas
 */
export function loadX11Api(
  platform: NodeJS.Platform = process.platform,
  env: SessionEnv = process.env,
  loadKoffi: KoffiLoader = requireKoffi,
): X11Api | null {
  if (platform !== 'linux') return null;
  // Sous Wayland, le handle de la fenêtre n'est pas un identifiant X11
  if (!env['DISPLAY'] || env['XDG_SESSION_TYPE'] === 'wayland') return null;

  try {
    const koffi = loadKoffi();
    const x11 = koffi.load('libX11.so.6');
    const openDisplay = x11.func('void *XOpenDisplay(const char *name)');
    const internAtom = x11.func('unsigned long XInternAtom(void *display, const char *name, int onlyIfExists)');
    const changeProperty = x11.func(
      'int XChangeProperty(void *display, unsigned long window, unsigned long property, unsigned long type, int format, int mode, const void *data, int count)',
    );
    const deleteProperty = x11.func('int XDeleteProperty(void *display, unsigned long window, unsigned long property)');
    const flush = x11.func('int XFlush(void *display)');

    const display = openDisplay(null);
    if (!display) return null;

    const wordSize = koffi.sizeof('long');
    const atom = (name: string): number => Number(internAtom(display, name, 0));
    const strutPartial = atom('_NET_WM_STRUT_PARTIAL');
    const strut = atom('_NET_WM_STRUT');
    const write = (windowId: number, property: number, values: readonly number[]): void => {
      changeProperty(display, windowId, property, XA_CARDINAL, FORMAT_32, PROP_MODE_REPLACE, encodeCardinals(values, wordSize), values.length);
    };

    return {
      setStrut(windowId, value) {
        write(windowId, strutPartial, strutPartialValues(value));
        write(windowId, strut, strutValues(value));
        flush(display);
      },
      clearStrut(windowId) {
        deleteProperty(display, windowId, strutPartial);
        deleteProperty(display, windowId, strut);
        flush(display);
      },
    };
  } catch (error) {
    console.error('Barre ancrée X11 indisponible', error);
    return null;
  }
}
