import { sanitizeDensity, sanitizeDisplayId, sanitizeTheme } from './themes.js';
import type { EffectDensity, ThemeName } from './themes.js';

/** Où les réglages sont lus et écrits. */
export interface SettingsStore {
  readonly path: string;
  /** @returns Les réglages enregistrés, ou `false` s'il n'y en a pas */
  load(): unknown;
  save(data: unknown): void;
}

type RawSettings = Record<string, unknown>;

const isRecord = (value: unknown): value is RawSettings => typeof value === 'object' && value !== null;

/**
 * Réglages de l'utilisateur. Chaque lecture renvoie une valeur valide (valeur par défaut si
 * l'enregistrement est absent ou invalide) et chaque écriture est validée.
 */
export class Settings {
  private raw: RawSettings | null = null;

  /**
   * @param store Fichier des réglages
   * @param seasonTheme Thème de la saison du jour, utilisé en mode automatique
   */
  constructor(
    private readonly store: SettingsStore,
    private readonly seasonTheme: () => ThemeName,
  ) {}

  get filePath(): string {
    return this.store.path;
  }

  get isButtonModeEnabled(): boolean {
    const stored = this.read().isButtonModeEnabled;
    return typeof stored === 'boolean' ? stored : true;
  }

  set isButtonModeEnabled(value: boolean) {
    this.read().isButtonModeEnabled = value;
  }

  /** Barre ancrée au bord de l'écran (AppBar Windows). Prioritaire sur les modes bouton et souris. */
  get appBarEnabled(): boolean {
    return this.read().appBarEnabled === true;
  }

  set appBarEnabled(value: boolean) {
    this.read().appBarEnabled = value === true;
  }

  /** Barre ancrée qui se replie quand la souris la quitte. */
  get appBarAutoHide(): boolean {
    return this.read().appBarAutoHide === true;
  }

  set appBarAutoHide(value: boolean) {
    this.read().appBarAutoHide = value === true;
  }

  get theme(): ThemeName {
    return sanitizeTheme(this.read().theme);
  }

  set theme(value: unknown) {
    this.read().theme = sanitizeTheme(value);
  }

  /** Thème automatique : suit les dates officielles des saisons (par défaut non). */
  get themeAuto(): boolean {
    return this.read().themeAuto === true;
  }

  set themeAuto(value: boolean) {
    this.read().themeAuto = value === true;
  }

  /** Thème réellement appliqué : celui de la saison en mode automatique, sinon le choix manuel. */
  get effectiveTheme(): ThemeName {
    return this.themeAuto ? this.seasonTheme() : this.theme;
  }

  /** Effets de saison activés (par défaut oui). */
  get effetsSaison(): boolean {
    return this.read().effetsSaison !== false;
  }

  set effetsSaison(value: unknown) {
    this.read().effetsSaison = value !== false;
  }

  get densiteEffets(): EffectDensity {
    return sanitizeDensity(this.read().densiteEffets);
  }

  set densiteEffets(value: unknown) {
    this.read().densiteEffets = sanitizeDensity(value);
  }

  /** Identifiant de l'écran choisi (`null` = écran principal). */
  get displayId(): number | null {
    return sanitizeDisplayId(this.read().displayId);
  }

  set displayId(value: unknown) {
    this.read().displayId = sanitizeDisplayId(value);
  }

  save(): void {
    this.store.save({
      isButtonModeEnabled: this.isButtonModeEnabled,
      appBarEnabled: this.appBarEnabled,
      appBarAutoHide: this.appBarAutoHide,
      theme: this.theme,
      themeAuto: this.themeAuto,
      effetsSaison: this.effetsSaison,
      densiteEffets: this.densiteEffets,
      displayId: this.displayId,
    });
  }

  /** Charge l'enregistrement à la première utilisation ; un fichier absent ou illisible donne des réglages vides. */
  private read(): RawSettings {
    if (!this.raw) {
      const loaded = this.safeLoad();
      this.raw = isRecord(loaded) ? loaded : {};
    }

    return this.raw;
  }

  private safeLoad(): unknown {
    try {
      return this.store.load();
    } catch (error) {
      console.error('Réglages illisibles, valeurs par défaut utilisées', error);
      return false;
    }
  }
}
