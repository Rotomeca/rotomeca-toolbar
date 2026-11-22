/**
 * Génération du script qui applique le thème sur la racine d'une page locale.
 *
 * Fonction pure, utilisée par `ThemeService`. Le script pilote les attributs `data-*` lus par les
 * feuilles de style des pages.
 */
// [themes.ts] Thèmes disponibles, leurs attributs (`data-theme`, `data-palette`) et la validation des réglages d'apparence
import { SEASON_THEMES, resolveTheme } from '../settings/themes.js';
import type { EffectDensity, ThemeAttributes } from '../settings/themes.js';
// [dayMoment.ts] Moment de la journée (aube, journée, crépuscule, nuit) d'après l'heure locale
import type { DayMoment } from './dayMoment.js';

/** Ce dont dépend le script de thème. */
export interface ThemeScriptInput {
  /** Thème réellement appliqué (saison du jour en mode automatique). */
  readonly effectiveTheme: string;
  /** Les effets de saison sont activés dans les réglages. */
  readonly effectsEnabled: boolean;
  /** Densité des effets de saison. */
  readonly effectsDensity: EffectDensity;
  /** Le système est en mode sombre (utile au thème « Système »). */
  readonly systemIsDark: boolean;
  /** Moment de la journée ; absent hors thème automatique ou si « Moments et météo » est coupé. */
  readonly moment?: DayMoment | undefined;
}

/** Palette de l'été la nuit : le seul cas où un moment change la palette. */
const SUMMER_NIGHT_PALETTE = 'ete-nuit';

/**
 * @param attrs Attributs du thème résolu
 * @param moment Moment de la journée, s'il y en a un
 * @returns Les attributs à poser : l'été passe en sombre (`ete-nuit`) la nuit
 */
function withMoment(attrs: ThemeAttributes, moment: DayMoment | undefined): ThemeAttributes {
  if (moment === 'nuit' && attrs.palette === 'ete') return { theme: 'dark', palette: SUMMER_NIGHT_PALETTE };
  return attrs;
}

/**
 * @returns Le script qui applique le thème (`data-theme`, `data-palette`, `data-moment`, `data-fx`,
 * `data-fx-density`) sur la racine d'une page. Les effets ne sont actifs que sur un thème de saison ;
 * `data-moment` est retiré quand il n'y a pas de moment.
 */
export function buildThemeScript(input: ThemeScriptInput): string {
  const base = resolveTheme(input.effectiveTheme, input.systemIsDark);
  const fx = input.effectsEnabled && SEASON_THEMES.includes(base.palette);
  const attrs = withMoment(base, input.moment);
  const moment = input.moment
    ? `h.dataset.moment = ${JSON.stringify(input.moment)};`
    : 'delete h.dataset.moment;';

  return `{ const h = document.documentElement; h.dataset.theme = ${JSON.stringify(attrs.theme)}; h.dataset.palette = ${JSON.stringify(attrs.palette)}; ${moment} h.dataset.fx = ${JSON.stringify(fx ? 'on' : 'off')}; h.dataset.fxDensity = ${JSON.stringify(input.effectsDensity)}; }`;
}
