/**
 * Catalogue des thèmes : familles, variantes, aperçus et libellés.
 *
 * Utilisé par la page des paramètres (`src/page.settings/`) pour construire le sélecteur de thème.
 * Ne dépend de rien : les libellés sont des clés de traduction.
 */

/** Une variante d'un thème parent : le thème final qu'elle enregistre, et son libellé. */
export interface ThemeVariant {
  /** Clé de traduction du libellé de la variante. */
  readonly label: string;
  /** Thème final enregistré quand la variante est choisie. */
  readonly theme: string;
}

/** Un thème, ou un regroupement de variantes (« vert » : classique ou sapin). */
export interface ThemeEntry {
  /** Nom du thème, ou du regroupement s'il a des variantes. */
  readonly name: string;
  /** Variantes du regroupement ; absent pour un thème simple. */
  readonly variants?: readonly ThemeVariant[];
}

/** Un groupe de thèmes affiché ensemble dans le sélecteur (base, couleurs, saisons). */
export interface ThemeFamily {
  /** Clé de traduction du titre de la famille. */
  readonly label: string;
  /** Thèmes et regroupements de la famille, dans l'ordre d'affichage. */
  readonly entries: readonly ThemeEntry[];
}

/** Identifiant d'une famille de thèmes. */
export type FamilyKey = 'base' | 'colors' | 'seasons';

/**
 * Familles de thèmes (ordre d'affichage). Une entrée est un thème parent : sans `variants`,
 * c'est un thème ; avec `variants`, c'est un regroupement dont chaque variante désigne le
 * thème final enregistré (« sapin », « noel », « cerisier »…).
 */
export const THEME_FAMILIES: Readonly<Record<FamilyKey, ThemeFamily>> = {
  base: {
    label: 'settings.familyBase',
    entries: [
      { name: 'system' },
      {
        name: 'clair',
        variants: [
          { label: 'settings.variantClassic', theme: 'clair' },
          { label: 'settings.themeWhite', theme: 'blanc' },
        ],
      },
      {
        name: 'sombre',
        variants: [
          { label: 'settings.variantClassic', theme: 'sombre' },
          { label: 'settings.themeBlack', theme: 'noir' },
        ],
      },
    ],
  },
  colors: {
    label: 'settings.familyColors',
    entries: [
      { name: 'marron' },
      { name: 'rouge' },
      { name: 'bleu' },
      {
        name: 'vert',
        variants: [
          { label: 'settings.variantClassic', theme: 'vert' },
          { label: 'settings.variantSapin', theme: 'sapin' },
        ],
      },
    ],
  },
  seasons: {
    label: 'settings.familySeasons',
    entries: [
      {
        name: 'hiver',
        variants: [
          { label: 'settings.variantNeige', theme: 'hiver' },
          { label: 'settings.variantNoel', theme: 'noel' },
        ],
      },
      { name: 'automne' },
      {
        name: 'printemps',
        variants: [
          { label: 'settings.variantFeuilles', theme: 'printemps' },
          { label: 'settings.variantCerisier', theme: 'cerisier' },
        ],
      },
      { name: 'ete' },
    ],
  },
};

/** `data-theme` et `data-palette` de l'aperçu d'un thème (« system » a un aperçu à part). */
export const THEME_PREVIEWS: Readonly<Record<string, readonly [mode: string, palette: string]>> = {
  clair: ['light', ''],
  sombre: ['dark', ''],
  blanc: ['light', 'blanc'],
  noir: ['dark', 'noir'],
  marron: ['dark', 'marron'],
  rouge: ['dark', 'rouge'],
  bleu: ['dark', 'bleu'],
  vert: ['dark', 'vert'],
  sapin: ['dark', 'sapin'],
  hiver: ['dark', 'hiver'],
  automne: ['dark', 'automne'],
  printemps: ['dark', 'printemps'],
  cerisier: ['dark', 'cerisier'],
  ete: ['light', 'ete'],
  noel: ['dark', 'noel'],
};

/** Clé de traduction du nom de chaque thème. */
export const THEME_LABELS: Readonly<Record<string, string>> = {
  system: 'settings.themeSystem',
  clair: 'settings.themeClair',
  sombre: 'settings.themeDark',
  blanc: 'settings.themeWhite',
  noir: 'settings.themeBlack',
  marron: 'settings.themeMarron',
  rouge: 'settings.themeRed',
  bleu: 'settings.themeBlue',
  vert: 'settings.themeGreen',
  sapin: 'settings.themeSapin',
  hiver: 'settings.themeHiver',
  automne: 'settings.themeAutomne',
  printemps: 'settings.themePrintemps',
  cerisier: 'settings.themeCerisier',
  ete: 'settings.themeEte',
  noel: 'settings.themeNoel',
};

/** Identifiants des familles, dans l'ordre d'affichage. */
const FAMILY_KEYS = Object.keys(THEME_FAMILIES) as FamilyKey[];

/**
 * Vérifie qu'une valeur est un identifiant de famille.
 * @param value Valeur à contrôler
 * @returns `true` si c'est une famille connue
 */
export const isFamilyKey = (value: string): value is FamilyKey => (FAMILY_KEYS as string[]).includes(value);

/**
 * Liste les thèmes finaux d'une entrée.
 * @param entry Thème ou regroupement
 * @returns Les thèmes finaux que couvre une entrée
 */
export function themesOf(entry: ThemeEntry): string[] {
  return entry.variants ? entry.variants.map((variant) => variant.theme) : [entry.name];
}

/**
 * Retrouve la famille d'un thème enregistré.
 * @param theme Thème final
 * @returns La famille qui contient ce thème final (« base » à défaut)
 */
export function familyOf(theme: string): FamilyKey {
  return FAMILY_KEYS.find((key) => THEME_FAMILIES[key].entries.some((entry) => themesOf(entry).includes(theme))) ?? 'base';
}
