/**
 * Application du thème de l'utilisateur aux pages locales, et mise à jour quand il change.
 *
 * Utilisé par `App` au démarrage et après un changement de réglage. Dépend de `Settings` et
 * d'un `ThemeEnvironment` injecté (branché sur Electron par `electronThemeEnvironment`).
 */
// [Settings.ts] Réglages de l'utilisateur : accesseurs validés au-dessus d'un fichier de réglages
import type { Settings } from '../settings/Settings.js';
// [themeScript.ts] Génération du script qui applique le thème sur la racine d'une page locale
import { buildThemeScript } from './themeScript.js';

/** Une page de l'application (un sous-ensemble de `WebContents`). */
export interface ThemedContents {
  isDestroyed(): boolean;
  getURL(): string;
  executeJavaScript(script: string): Promise<unknown>;
  on(event: 'dom-ready', listener: () => void): unknown;
}

/** Ce que le service demande au système. */
export interface ThemeEnvironment {
  systemIsDark(): boolean;
  allContents(): readonly ThemedContents[];
  onContentsCreated(listener: (contents: ThemedContents) => void): void;
  /** Le thème « Système » suit le mode clair/sombre en direct. */
  onSystemThemeChanged(listener: () => void): void;
  /** Réveil de veille. */
  onResume(listener: () => void): void;
  /** Appelle `callback` à intervalle régulier (sans empêcher l'application de se fermer). */
  every(intervalMs: number, callback: () => void): void;
}

/** Préfixe des pages locales : les sites tiers ne reçoivent jamais le script de thème. */
const LOCAL_PAGE_PREFIX = 'file://';
/** Période (ms) de la vérification du changement de saison en thème automatique. */
const SEASON_CHECK_INTERVAL_MS = 60 * 1000;

/** Applique le thème de l'utilisateur aux pages locales, et le met à jour quand il change. */
export class ThemeService {
  /** Dernier thème appliqué, pour ne rediffuser que s'il change. */
  private lastEffectiveTheme: string | null = null;

  /**
   * @param settings Réglages qui fournissent le thème et les effets
   * @param environment Accès au système (mode sombre, pages, horloge)
   */
  constructor(
    private readonly settings: Settings,
    private readonly environment: ThemeEnvironment,
  ) {}

  /** Le script qui applique le thème courant sur la racine d'une page. */
  get script(): string {
    return buildThemeScript({
      effectiveTheme: this.settings.effectiveTheme,
      effectsEnabled: this.settings.effetsSaison,
      effectsDensity: this.settings.densiteEffets,
      systemIsDark: this.environment.systemIsDark(),
    });
  }

  /** Applique le thème courant à toutes les pages locales ouvertes. */
  broadcast(): void {
    this.lastEffectiveTheme = this.settings.effectiveTheme;
    const script = this.script;

    for (const contents of this.environment.allContents()) {
      if (contents.isDestroyed() || !contents.getURL().startsWith(LOCAL_PAGE_PREFIX)) continue;
      contents.executeJavaScript(script).catch(console.error);
    }
  }

  /**
   * Applique le thème à chaque page locale dès son chargement (fenêtres, mais aussi vues
   * intégrées), suit le mode du système et, en thème automatique, le changement de saison
   * (au réveil de veille et chaque minute, dont minuit), sans rediffuser s'il n'a pas changé.
   */
  start(): void {
    this.environment.onContentsCreated((contents) => {
      contents.on('dom-ready', () => {
        if (!contents.getURL().startsWith(LOCAL_PAGE_PREFIX)) return;
        contents.executeJavaScript(this.script).catch(console.error);
      });
    });

    this.environment.onSystemThemeChanged(() => this.broadcast());

    this.lastEffectiveTheme = this.settings.effectiveTheme;
    const checkSeason = (): void => {
      if (this.settings.effectiveTheme !== this.lastEffectiveTheme) this.broadcast();
    };
    this.environment.every(SEASON_CHECK_INTERVAL_MS, checkSeason);
    this.environment.onResume(checkSeason);
  }
}
