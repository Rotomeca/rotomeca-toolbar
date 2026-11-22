/**
 * Ciel forcé par le mode debug : validation de ce que la page envoie.
 *
 * Utilisé par `ThemeService` (développement seulement). Les valeurs reçues sont non fiables :
 * seules celles de la liste blanche passent, le reste redevient « automatique » (`null`).
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { SkyOverrideDto } from '../../shared/dto.js';
// [dayMoment.ts] Moment de la journée (aube, journée, crépuscule, nuit) d'après l'heure locale
import { DAY_MOMENTS } from '../../shared/dayMoment.js';
// [themes.ts] Thèmes disponibles, leurs attributs (`data-theme`, `data-palette`) et la validation des réglages d'apparence
import { SEASON_THEMES } from '../settings/themes.js';

/** Rien n'est forcé : saison, moment et météo réels. */
export const NO_SKY_OVERRIDE: SkyOverrideDto = { season: null, moment: null, weather: null };

/**
 * @param value Valeur brute
 * @param allowed Valeurs autorisées
 * @returns La valeur si elle est autorisée, sinon `null`
 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

/**
 * @param raw Donnée non fiable reçue d'une page
 * @returns Le ciel forcé validé, ou `null` si rien n'est forcé (tout est « automatique »)
 */
export function sanitizeSkyOverride(raw: unknown): SkyOverrideDto | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const received = raw as Record<string, unknown>;
  const override: SkyOverrideDto = {
    season: oneOf(received.season, SEASON_THEMES),
    moment: oneOf(received.moment, DAY_MOMENTS),
    weather: oneOf(received.weather, ['pluie', 'sec'] as const),
  };

  return override.season || override.moment || override.weather ? override : null;
}
