/** Attributs `data-theme` / `data-palette` d'un thème. */
export interface ThemeAttributes {
  readonly theme: 'light' | 'dark';
  readonly palette: string;
}

/**
 * Thèmes autorisés (liste blanche) et attributs correspondants. « system » vaut `null` :
 * il est résolu en clair ou sombre par `resolveTheme`.
 */
const THEME_ATTRS = {
  system: null,
  clair: { theme: 'light', palette: '' },
  sombre: { theme: 'dark', palette: '' },
  marron: { theme: 'dark', palette: 'marron' },
  rouge: { theme: 'dark', palette: 'rouge' },
  bleu: { theme: 'dark', palette: 'bleu' },
  vert: { theme: 'dark', palette: 'vert' },
  sapin: { theme: 'dark', palette: 'sapin' },
  blanc: { theme: 'light', palette: 'blanc' },
  noir: { theme: 'dark', palette: 'noir' },
  hiver: { theme: 'dark', palette: 'hiver' },
  automne: { theme: 'dark', palette: 'automne' },
  printemps: { theme: 'dark', palette: 'printemps' },
  cerisier: { theme: 'dark', palette: 'cerisier' },
  ete: { theme: 'light', palette: 'ete' },
  noel: { theme: 'dark', palette: 'noel' },
} as const satisfies Record<string, ThemeAttributes | null>;

export type ThemeName = keyof typeof THEME_ATTRS;

export const THEMES = Object.keys(THEME_ATTRS) as readonly ThemeName[];
export const DEFAULT_THEME: ThemeName = 'system';

/** Thèmes de saison : les seuls à porter des effets animés. */
export const SEASON_THEMES: readonly string[] = ['hiver', 'automne', 'printemps', 'cerisier', 'ete', 'noel'];

export const EFFECT_DENSITIES = ['discrete', 'normale', 'abondante'] as const;
export type EffectDensity = (typeof EFFECT_DENSITIES)[number];
export const DEFAULT_DENSITY: EffectDensity = 'normale';

/** Anciennes valeurs enregistrées (avant 3.x) → thème équivalent. */
const LEGACY_THEMES: Readonly<Record<string, ThemeName>> = {
  dark: 'sombre',
  red: 'rouge',
  blue: 'bleu',
  green: 'vert',
  white: 'blanc',
  black: 'noir',
};

const isTheme = (value: string): value is ThemeName => (THEMES as readonly string[]).includes(value);

/** @returns Une densité valide, ou la densité par défaut */
export function sanitizeDensity(value: unknown): EffectDensity {
  return (EFFECT_DENSITIES as readonly unknown[]).includes(value) ? (value as EffectDensity) : DEFAULT_DENSITY;
}

/** @returns Un thème valide (les anciens noms sont convertis), ou le thème par défaut */
export function sanitizeTheme(value: unknown): ThemeName {
  if (typeof value !== 'string') return DEFAULT_THEME;

  const legacy = Object.hasOwn(LEGACY_THEMES, value) ? LEGACY_THEMES[value] : undefined;
  if (legacy) return legacy;

  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * @param theme Réglage de thème
 * @param systemIsDark Le système est en mode sombre
 * @returns Les attributs à appliquer aux pages
 */
export function resolveTheme(theme: unknown, systemIsDark: boolean): ThemeAttributes {
  return THEME_ATTRS[sanitizeTheme(theme)] ?? { theme: systemIsDark ? 'dark' : 'light', palette: '' };
}

/** @returns Un identifiant d'écran valide, ou null (écran principal) */
export function sanitizeDisplayId(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}
