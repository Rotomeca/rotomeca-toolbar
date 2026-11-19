/** Ce que ce module lit d'un écran (un sous-ensemble de `Electron.Display`). */
export interface DisplayLike {
  readonly id: number;
  readonly label?: string;
  readonly bounds: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly scaleFactor: number;
}

export interface DisplayInfo {
  readonly id: number;
  readonly label: string;
  readonly isPrimary: boolean;
}

type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

/**
 * @param displays Écrans connectés
 * @param chosenId Écran choisi dans les paramètres (`null` = écran principal)
 * @param primary Écran principal du système
 * @returns L'écran choisi, ou l'écran principal s'il n'est plus branché
 * (l'identifiant enregistré n'est jamais modifié : l'écran est repris dès son retour)
 */
export function pickDisplay<D extends { readonly id: number }>(displays: readonly D[], chosenId: number | null, primary: D): D {
  return (chosenId !== null && displays.find((display) => display.id === chosenId)) || primary;
}

/**
 * Écrans pour la page des paramètres : numérotés de gauche à droite (puis de haut en bas)
 * et nommés par leur libellé système ; la résolution et l'échelle ne servent qu'à distinguer
 * des écrans qui portent le même nom.
 */
export function describeDisplays(displays: readonly DisplayLike[], primaryId: number, translate: Translate): DisplayInfo[] {
  const ordered = [...displays].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const names = ordered.map((display, index) => display.label?.trim() || translate('display.fallbackName', { n: index + 1 }));

  return ordered.map((display, index) => {
    const isDuplicate = names.filter((name) => name === names[index]).length > 1;
    const scale = display.scaleFactor !== 1 ? ` @${Math.round(display.scaleFactor * 100)}%` : '';
    const details = isDuplicate ? ` (${display.size.width}x${display.size.height}${scale})` : '';
    const primarySuffix = display.id === primaryId ? ` - ${translate('display.primary')}` : '';

    return {
      id: display.id,
      label: `${index + 1}. ${names[index]}${details}${primarySuffix}`,
      isPrimary: display.id === primaryId,
    };
  });
}
