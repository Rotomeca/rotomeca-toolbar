/**
 * Réglages de l'utilisateur : accesseurs validés au-dessus d'un fichier de réglages.
 *
 * Lus par `App.ts`, la barre et le thème ; modifiés depuis la page des paramètres via `applySettingsUpdate`.
 * Chaque lecture renvoie une valeur valide même si le fichier est absent ou abîmé.
 */
// [themes.ts] Thèmes disponibles, leurs attributs (`data-theme`, `data-palette`) et la validation des réglages d'apparence
import { sanitizeDensity, sanitizeDisplayId, sanitizeTheme } from './themes.js';
import type { EffectDensity, ThemeName } from './themes.js';

/** Où les réglages sont lus et écrits. */
export interface SettingsStore {
  /** Chemin du fichier des réglages (affiché dans la page des paramètres). */
  readonly path: string;
  /** @returns Les réglages enregistrés, ou `false` s'il n'y en a pas */
  load(): unknown;
  /** Enregistre les réglages. */
  save(data: unknown): void;
}

/** Réglages tels que lus sur le disque, avant validation. */
type RawSettings = Record<string, unknown>;

/** Vrai si la valeur lue est un objet. */
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

  /** Chemin du fichier où les réglages sont enregistrés. */
  get filePath(): string {
    return this.store.path;
  }

  /** Mode bouton : la barre s'ouvre depuis un bouton plutôt qu'au survol du bord (par défaut oui). */
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

  /** Thème choisi à la main ; le thème par défaut si la valeur est invalide. */
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

  /** Moments de la journée et météo en thème automatique (par défaut oui). */
  get momentsMeteo(): boolean {
    return this.read().momentsMeteo !== false;
  }

  set momentsMeteo(value: unknown) {
    this.read().momentsMeteo = value !== false;
  }

  /** Densité des effets de saison (animations de neige, pétales, etc.). */
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

  /** Enregistre l'ensemble des réglages (valeurs déjà validées) dans le fichier. */
  save(): void {
    this.store.save({
      isButtonModeEnabled: this.isButtonModeEnabled,
      appBarEnabled: this.appBarEnabled,
      appBarAutoHide: this.appBarAutoHide,
      theme: this.theme,
      themeAuto: this.themeAuto,
      effetsSaison: this.effetsSaison,
      momentsMeteo: this.momentsMeteo,
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

  /** @returns Le contenu du fichier, ou `false` (erreur journalisée) s'il ne peut pas être lu */
  private safeLoad(): unknown {
    try {
      return this.store.load();
    } catch (error) {
      console.error('Réglages illisibles, valeurs par défaut utilisées', error);
      return false;
    }
  }
}
