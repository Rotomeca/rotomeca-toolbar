import { SEASON_THEMES, resolveTheme } from '../settings/themes.js';
import type { EffectDensity } from '../settings/themes.js';

export interface ThemeScriptInput {
  /** Thème réellement appliqué (saison du jour en mode automatique). */
  readonly effectiveTheme: string;
  readonly effectsEnabled: boolean;
  readonly effectsDensity: EffectDensity;
  readonly systemIsDark: boolean;
}

/**
 * @returns Le script qui applique le thème (`data-theme`, `data-palette`, `data-fx`, `data-fx-density`)
 * sur la racine d'une page. Les effets ne sont actifs que sur un thème de saison.
 */
export function buildThemeScript(input: ThemeScriptInput): string {
  const attrs = resolveTheme(input.effectiveTheme, input.systemIsDark);
  const fx = input.effectsEnabled && SEASON_THEMES.includes(attrs.palette);

  return `{ const h = document.documentElement; h.dataset.theme = ${JSON.stringify(attrs.theme)}; h.dataset.palette = ${JSON.stringify(attrs.palette)}; h.dataset.fx = ${JSON.stringify(fx ? 'on' : 'off')}; h.dataset.fxDensity = ${JSON.stringify(input.effectsDensity)}; }`;
}
