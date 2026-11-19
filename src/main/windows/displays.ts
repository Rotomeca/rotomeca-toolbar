/**
 * Choix de l'écran de la barre et description des écrans pour la page des paramètres.
 *
 * Fonctions pures, sans `electron` : les écrans sont lus à travers `DisplayLike`. Utilisé par
 * `App` pour placer la barre et par les paramètres pour lister les écrans disponibles.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { DisplayInfo } from '../../shared/dto.js';

/** Ce que ce module lit d'un écran (un sous-ensemble de `Electron.Display`). */
export interface DisplayLike {
  readonly id: number;
  readonly label?: string;
  readonly bounds: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly scaleFactor: number;
}

export type { DisplayInfo };

/** Fonction de traduction d'une clé de `locales/*.json`, avec variables optionnelles. */
type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

/**
 * Choisit l'écran sur lequel afficher la barre.
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
