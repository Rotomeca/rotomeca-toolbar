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
// [dayMoment.ts] Moment de la journée (aube, journée, crépuscule, nuit) d'après l'heure locale
import { momentFor, nextMomentBoundary } from '../../shared/dayMoment.js';
import type { DayMoment } from '../../shared/dayMoment.js';
// [rainDay.ts] Tirage de la pluie : un jour est pluvieux ou non, de façon déterministe d'après la date
import { canRain, isRainyDay } from '../../shared/rainDay.js';

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
  /** Heure locale actuelle. */
  now(): Date;
  /** Appelle `callback` une fois dans `delayMs` (sans empêcher l'application de se fermer) ; renvoie l'annulation. */
  after(delayMs: number, callback: () => void): () => void;
}

/** Préfixe des pages locales : les sites tiers ne reçoivent jamais le script de thème. */
const LOCAL_PAGE_PREFIX = 'file://';
/** Période (ms) de la vérification du changement de saison en thème automatique. */
const SEASON_CHECK_INTERVAL_MS = 60 * 1000;

/** Applique le thème de l'utilisateur aux pages locales, et le met à jour quand il change. */
export class ThemeService {
  /** Dernier thème et moment appliqués, pour ne rediffuser que s'ils changent. */
  private lastAppearance: string | null = null;
  /** Annule le minuteur de la prochaine frontière de moment. */
  private cancelBoundaryTimer: (() => void) | null = null;

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
      moment: this.currentMoment(),
      rainy: this.isRaining(),
    });
  }

  /** Le moment de la journée, seulement en thème automatique avec « Moments et météo » activé. */
  private currentMoment(): DayMoment | undefined {
    if (!this.settings.themeAuto || !this.settings.momentsMeteo) return undefined;
    return momentFor(this.environment.now());
  }

  /** Il pleut : « Moments et météo » actif, saison pluvieuse et jour de pluie tiré. */
  private isRaining(): boolean {
    if (this.currentMoment() === undefined) return false;
    return canRain(this.settings.effectiveTheme) && isRainyDay(this.environment.now());
  }

  /** Thème effectif, moment et météo, comparés pour savoir si l'apparence a changé. */
  private appearance(): string {
    return `${this.settings.effectiveTheme}|${this.currentMoment() ?? ''}|${this.isRaining()}`;
  }

  /** Applique le thème courant à toutes les pages locales ouvertes. */
  broadcast(): void {
    this.lastAppearance = this.appearance();
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

    this.lastAppearance = this.appearance();
    const checkAppearance = (): void => {
      if (this.appearance() !== this.lastAppearance) this.broadcast();
    };
    this.environment.every(SEASON_CHECK_INTERVAL_MS, checkAppearance);
    this.environment.onResume(() => {
      checkAppearance();
      this.armBoundaryTimer(checkAppearance);
    });
    this.armBoundaryTimer(checkAppearance);
  }

  /**
   * Règle le minuteur sur la prochaine frontière de moment (6 h, 9 h, 17 h, 19 h), puis le réarme.
   * @param onBoundary Réévaluation de l'apparence, appelée à chaque frontière
   */
  private armBoundaryTimer(onBoundary: () => void): void {
    this.cancelBoundaryTimer?.();

    const now = this.environment.now();
    const delay = nextMomentBoundary(now).getTime() - now.getTime();
    this.cancelBoundaryTimer = this.environment.after(delay, () => {
      onBoundary();
      this.armBoundaryTimer(onBoundary);
    });
  }
}
