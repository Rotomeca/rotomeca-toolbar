/**
 * Thèmes disponibles, leurs attributs (`data-theme`, `data-palette`) et la validation des réglages d'apparence.
 *
 * Utilisé par `Settings` pour valider thème, densité des effets et écran, et par `ThemeService` pour
 * résoudre le thème appliqué aux pages. La liste blanche empêche une page d'injecter une valeur arbitraire.
 */

/** Attributs `data-theme` / `data-palette` d'un thème. */
export interface ThemeAttributes {
  /** Variante claire ou sombre. */
  readonly theme: 'light' | 'dark';
  /** Nom de la palette de couleurs ; vide pour la palette de base. */
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

/** Nom d'un thème autorisé. */
export type ThemeName = keyof typeof THEME_ATTRS;

/** Liste de tous les noms de thème autorisés. */
export const THEMES = Object.keys(THEME_ATTRS) as readonly ThemeName[];
/** Thème utilisé quand le réglage est absent ou invalide : celui du système. */
export const DEFAULT_THEME: ThemeName = 'system';

/** Thèmes de saison : les seuls à porter des effets animés. */
export const SEASON_THEMES: readonly string[] = ['hiver', 'automne', 'printemps', 'cerisier', 'ete', 'noel'];

/** Densités possibles des effets de saison. */
export const EFFECT_DENSITIES = ['discrete', 'normale', 'abondante'] as const;
/** Densité d'effets autorisée. */
export type EffectDensity = (typeof EFFECT_DENSITIES)[number];
/** Densité utilisée par défaut. */
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

/** Vrai si la chaîne est un nom de thème connu. */
const isTheme = (value: string): value is ThemeName => (THEMES as readonly string[]).includes(value);

/**
 * @param value Valeur brute d'un réglage.
 * @returns Une densité valide, ou la densité par défaut
 */
export function sanitizeDensity(value: unknown): EffectDensity {
  return (EFFECT_DENSITIES as readonly unknown[]).includes(value) ? (value as EffectDensity) : DEFAULT_DENSITY;
}

/**
 * @param value Valeur brute d'un réglage.
 * @returns Un thème valide (les anciens noms sont convertis), ou le thème par défaut
 */
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

/**
 * @param value Valeur brute d'un réglage.
 * @returns Un identifiant d'écran valide, ou null (écran principal)
 */
export function sanitizeDisplayId(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}
