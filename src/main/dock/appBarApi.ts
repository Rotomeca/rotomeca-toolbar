import type * as Koffi from 'koffi';

/** Rectangle système, en pixels physiques. */
export interface NativeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Structure `APPBARDATA` de Windows. */
export interface AppBarData {
  cbSize: number;
  hWnd: bigint | number;
  uCallbackMessage: number;
  uEdge: number;
  rc: NativeRect;
  lParam: number;
}

/** Les deux appels natifs dont la barre ancrée a besoin. */
export interface AppBarApi {
  /** Taille en octets de `APPBARDATA`. */
  readonly size: number;
  /** @returns Non nul si le système a accepté le message (`SHAppBarMessage`) */
  shAppBarMessage(message: number, data: AppBarData): number | bigint;
  /** @returns L'identifiant du message enregistré sous ce nom (`RegisterWindowMessageW`) */
  registerMessage(name: string): number;
}

export type KoffiLoader = () => typeof Koffi;

// Chargement paresseux voulu : koffi est un module natif, il ne doit se charger que sous Windows
// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireKoffi: KoffiLoader = () => require('koffi') as typeof Koffi;

/**
 * Charge les fonctions natives de la barre ancrée. Seul endroit qui connaît koffi.
 * @param platform Plateforme courante : sous Windows uniquement
 * @param loadKoffi Chargeur de koffi, remplaçable dans les tests
 * @returns `null` hors Windows, ou si koffi ne se charge pas
 */
export function loadAppBarApi(
  platform: NodeJS.Platform = process.platform,
  loadKoffi: KoffiLoader = requireKoffi,
): AppBarApi | null {
  if (platform !== 'win32') return null;

  try {
    const koffi = loadKoffi();
    const rect = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const appBarData = koffi.struct('APPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'uintptr_t',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: rect,
      lParam: 'intptr_t',
    });

    return {
      size: koffi.sizeof(appBarData),
      shAppBarMessage: koffi
        .load('shell32.dll')
        .func('uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA *pData)') as AppBarApi['shAppBarMessage'],
      registerMessage: koffi
        .load('user32.dll')
        .func('uint32 __stdcall RegisterWindowMessageW(str16 lpString)') as AppBarApi['registerMessage'],
    };
  } catch (error) {
    console.error('AppBar indisponible', error);
    return null;
  }
}
