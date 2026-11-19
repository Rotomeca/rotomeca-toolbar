/**
 * Mises à jour de l'application, côté processus principal.
 *
 * - Windows / macOS : Squirrel (`autoUpdater`). Le téléchargement démarre dès qu'une
 *   version est trouvée ; Squirrel n'expose aucune progression, la barre est donc
 *   indéterminée.
 * - Linux : pas d'installation automatique ; on compare avec la dernière release GitHub
 *   et l'action ouvre la page de téléchargement.
 *
 * - Canal de test (toutes plateformes) : les releases GitHub marquées « pré-version »
 *   ne sont jamais proposées automatiquement (Hazel et `releases/latest` les ignorent).
 *   `checkTest()` cherche la plus récente. Avec Squirrel et un second serveur de mises
 *   à jour qui ne sert que les pré-versions (`testFeed`), `installTest()` la télécharge et
 *   l'installe comme une mise à jour normale, sur demande ; sinon (Linux, serveur de test
 *   absent) `installTest()` ouvre la page de la release et l'installation reste manuelle.
 *
 * L'état complet est renvoyé à la fenêtre Paramètres à chaque changement, la fenêtre
 * ne fait qu'afficher et déclencher « rechercher » / « mettre à jour ».
 */

import {
  fetchLatestRelease,
  fetchRecentReleases,
  findNewestPrerelease,
} from './githubReleases.js';
import type { HttpFetch } from './githubReleases.js';
import { isPrerelease } from './versions.js';

export const CHECK_INTERVAL = 60 * 60 * 1000;

const TEST_FEED_STALE_ERROR = 'update.test.errorUnavailable';
const CHECK_ERROR = 'update.card.errorCheck';
const DOWNLOAD_ERROR = 'update.card.errorDownload';

/** `available` n'existe que sous Linux (mise à jour manuelle). */
export type UpdateStage = 'uptodate' | 'available' | 'downloading' | 'ready';

/** Serveur de mises à jour interrogé par Squirrel : les versions publiées, ou les pré-versions. */
export type UpdateChannel = 'stable' | 'test';

export interface UpdateState {
  readonly etat: UpdateStage;
  /** Vérification en cours. */
  readonly verification: boolean;
  readonly versionActuelle: string;
  /** La version installée est une pré-version (`X.Y.Z-rcN`). */
  readonly prerelease: boolean;
  readonly versionDisponible: string | null;
  /** `null` : progression inconnue (Squirrel). */
  readonly pourcentage: number | null;
  /** Horodatage (ms) de la dernière vérification réussie. */
  readonly derniereVerification: number | null;
  /** Clé de traduction du dernier échec. */
  readonly erreur: string | null;
  /** Recherche d'une version de test en cours. */
  readonly verificationTest: boolean;
  /** Version de test plus récente que l'actuelle. */
  readonly versionTest: string | null;
  /** Horodatage (ms) de la dernière recherche de version de test réussie. */
  readonly derniereVerificationTest: number | null;
  /** Clé de traduction du dernier échec lié à la version de test. */
  readonly erreurTest: string | null;
  /** `installTest()` installe seule (sinon, ouvre la page de la release). */
  readonly testAuto: boolean;
}

/**
 * Ce que le gestionnaire attend de Squirrel (`Electron.autoUpdater` convient).
 * Signatures de méthodes : les écouteurs d'Electron reçoivent plus d'arguments.
 */
export interface SquirrelUpdater {
  on(event: 'update-available' | 'update-not-available', listener: () => void): unknown;
  on(event: 'update-downloaded', listener: (event: unknown, notes: string, releaseName: string) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): void;
  quitAndInstall(): void;
}

export interface UpdateManagerDependencies {
  /** Version courante. */
  readonly version: string;
  /** `null` si Squirrel n'est pas utilisable. */
  readonly autoUpdater: SquirrelUpdater | null;
  /** Dépôt GitHub des releases (`propriétaire/dépôt`). */
  readonly releasesRepo: string | null;
  /** Mode Linux : vérification par GitHub. */
  readonly manual: boolean;
  /** Simule un cycle complet (développement). */
  readonly simulate: boolean;
  readonly fetch: HttpFetch;
  readonly openExternal: (url: string) => void;
  readonly compareVersions: (a: string, b: string) => number;
  /** Sauvegardes avant le redémarrage. */
  readonly beforeInstall: () => void;
  /** Change le serveur interrogé par Squirrel. */
  readonly setFeed?: ((channel: UpdateChannel) => void) | null;
  /** Un serveur de mises à jour pour les pré-versions existe. */
  readonly testFeed?: boolean;
  readonly onChange: (state: UpdateState) => void;
  /** Notification système. */
  readonly notifyReady: (version: string | null) => void;
}

const IN_PROGRESS: readonly UpdateStage[] = ['downloading', 'ready'];

export class UpdateManager {
  readonly #deps: UpdateManagerDependencies;
  #state: UpdateState;
  #interval: NodeJS.Timeout | null = null;
  #started = false;
  #notifiedVersion: string | null = null;
  #pageUrl: string | null = null;
  #testUrl: string | null = null;
  /** Serveur actuellement interrogé par Squirrel. */
  #channel: UpdateChannel = 'stable';

  constructor(deps: UpdateManagerDependencies) {
    this.#deps = deps;
    this.#state = {
      etat: 'uptodate',
      verification: false,
      versionActuelle: deps.version,
      prerelease: isPrerelease(deps.version),
      versionDisponible: null,
      pourcentage: null,
      derniereVerification: null,
      erreur: null,
      verificationTest: false,
      versionTest: null,
      derniereVerificationTest: null,
      erreurTest: null,
      testAuto: Boolean(deps.autoUpdater && !deps.manual && !deps.simulate && deps.testFeed && deps.setFeed),
    };
  }

  /** La vérification est possible dans cet environnement. */
  get enabled(): boolean {
    const { autoUpdater, manual, releasesRepo, simulate } = this.#deps;
    return simulate || Boolean(autoUpdater) || (manual && Boolean(releasesRepo));
  }

  get state(): UpdateState {
    return { ...this.#state };
  }

  /** Vérifie au démarrage puis toutes les heures. */
  start(): void {
    if (this.#started || !this.enabled) return;
    this.#started = true;

    this.#bindSquirrel();
    void this.check();
    this.#interval = setInterval(() => void this.check(), CHECK_INTERVAL);
    this.#interval.unref();
  }

  /** Lance une vérification immédiate (sans effet si une est en cours ou si l'état est avancé). */
  async check(): Promise<void> {
    const { etat, verification } = this.#state;
    if (!this.enabled || verification || IN_PROGRESS.includes(etat)) return;

    this.#set({ verification: true, erreur: null });

    try {
      await this.#runCheck();
    } catch (error) {
      this.#fail(error);
    }
  }

  /**
   * Installe la version de test trouvée par `checkTest()` : téléchargement et
   * installation comme une mise à jour normale (même état, même bouton « redémarrer »).
   * Sans serveur de test, ouvre la page de la release.
   */
  installTest(): void {
    const { versionTest, testAuto, verification, etat } = this.#state;
    if (!versionTest) return;

    if (!testAuto) {
      this.openTest();
      return;
    }
    if (verification || IN_PROGRESS.includes(etat)) return;

    this.#useChannel('test');
    this.#set({ verification: true, erreur: null, erreurTest: null, versionDisponible: versionTest });
    try {
      this.#requireUpdater().checkForUpdates();
    } catch (error) {
      this.#fail(error);
    }
  }

  /** Installe (état prêt) ou ouvre la page de téléchargement (Linux). */
  install(): void {
    const { etat } = this.#state;

    if (etat === 'available' && this.#pageUrl) {
      this.#deps.openExternal(this.#pageUrl);
      return;
    }

    if (etat !== 'ready') return;

    if (this.#deps.simulate) {
      this.#set({ etat: 'uptodate', versionDisponible: null });
      return;
    }

    try {
      this.#deps.beforeInstall();
    } catch (error) {
      console.error(error);
    }
    this.#requireUpdater().quitAndInstall();
  }

  /**
   * Cherche la plus récente pré-version GitHub, plus récente que la version
   * actuelle. Action volontaire : jamais lancée automatiquement, et sans effet
   * sur l'état des mises à jour normales.
   */
  async checkTest(): Promise<void> {
    const { releasesRepo, compareVersions, version, fetch } = this.#deps;
    if (!releasesRepo || this.#state.verificationTest) return;

    this.#set({ verificationTest: true, erreurTest: null });
    try {
      const releases = await fetchRecentReleases(fetch, releasesRepo);
      const newest = findNewestPrerelease(releases, releasesRepo, version, compareVersions);

      this.#testUrl = newest?.page ?? null;
      this.#set({
        verificationTest: false,
        versionTest: newest?.version ?? null,
        derniereVerificationTest: Date.now(),
      });
    } catch (error) {
      console.error('Test update error', error);
      this.#set({ verificationTest: false, erreurTest: CHECK_ERROR });
    }
  }

  /** Ouvre la page de la version de test trouvée (téléchargement manuel). */
  openTest(): void {
    if (this.#testUrl) this.#deps.openExternal(this.#testUrl);
  }

  async #runCheck(): Promise<void> {
    const { simulate, manual } = this.#deps;

    if (simulate) {
      await this.#simulate();
    } else if (manual) {
      await this.#checkGithub();
    } else {
      this.#useChannel('stable');
      this.#requireUpdater().checkForUpdates();
    }
  }

  #requireUpdater(): SquirrelUpdater {
    if (!this.#deps.autoUpdater) throw new Error('Squirrel n\'est pas utilisable dans cet environnement');
    return this.#deps.autoUpdater;
  }

  #bindSquirrel(): void {
    const { autoUpdater, manual, simulate } = this.#deps;
    if (!autoUpdater || manual || simulate) return;

    autoUpdater.on('update-available', () => {
      this.#set({
        etat: 'downloading',
        pourcentage: null,
        verification: false,
        erreur: null,
        derniereVerification: Date.now(),
      });
    });

    autoUpdater.on('update-not-available', () => this.#onNoUpdate());

    autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => this.#onDownloaded(releaseName));

    autoUpdater.on('error', (error) => this.#fail(error));
  }

  #onNoUpdate(): void {
    if (this.#channel === 'test') {
      // Le serveur de test met sa liste en cache (15 min par défaut) : la
      // pré-version trouvée sur GitHub n'y est peut-être pas encore
      this.#set({
        etat: 'uptodate',
        verification: false,
        erreur: null,
        versionDisponible: null,
        erreurTest: TEST_FEED_STALE_ERROR,
      });
      return;
    }

    this.#set({ etat: 'uptodate', verification: false, erreur: null, derniereVerification: Date.now() });
  }

  #onDownloaded(releaseName: string): void {
    // Squirrel ne donne le nom de version que sur macOS
    const version =
      typeof releaseName === 'string' && /^v?\d+(\.\d+)*/.test(releaseName)
        ? releaseName.replace(/^v/i, '')
        : this.#state.versionDisponible;

    this.#set({
      etat: 'ready',
      versionDisponible: version,
      pourcentage: 100,
      verification: false,
      erreur: null,
    });
    this.#deps.notifyReady(version);
  }

  async #checkGithub(): Promise<void> {
    const { releasesRepo, compareVersions, version, fetch } = this.#deps;
    if (!releasesRepo) throw new Error('Aucun dépôt de releases configuré');

    // N'ouvrir que la page des versions du dépôt, jamais une URL quelconque
    const { version: latest, page } = await fetchLatestRelease(fetch, releasesRepo);

    if (compareVersions(latest, version) <= 0) {
      this.#set({ etat: 'uptodate', verification: false, derniereVerification: Date.now() });
      return;
    }

    this.#pageUrl = page;
    this.#set({
      etat: 'available',
      versionDisponible: latest,
      verification: false,
      derniereVerification: Date.now(),
    });
    if (this.#notifiedVersion !== latest) {
      this.#notifiedVersion = latest;
      this.#deps.notifyReady(latest);
    }
  }

  /** Cycle factice : vérification, téléchargement puis prête. */
  async #simulate(): Promise<void> {
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    await wait(1200);
    this.#set({
      etat: 'downloading',
      versionDisponible: '9.9.9',
      pourcentage: null,
      verification: false,
      derniereVerification: Date.now(),
    });
    await wait(4000);
    this.#set({ etat: 'ready', pourcentage: 100 });
  }

  /**
   * Revient à l'état précédent (la vérification ou le téléchargement échoue) et
   * garde un message à afficher.
   */
  #fail(error: unknown): void {
    console.error('Update error', error);
    const { etat } = this.#state;

    // Un téléchargement raté retombe sur « à jour » : une nouvelle vérification le relancera
    const next: UpdateStage = etat === 'downloading' ? 'uptodate' : etat;
    const message = etat === 'uptodate' || etat === 'available' ? CHECK_ERROR : DOWNLOAD_ERROR;

    // L'échec d'une installation de test s'affiche dans le bloc « Version de test »
    const failure: Partial<UpdateState> =
      this.#channel === 'test'
        ? { erreur: null, erreurTest: message, ...(next === 'uptodate' && { versionDisponible: null }) }
        : { erreur: message };

    this.#set({ etat: next, verification: false, pourcentage: null, ...failure });
  }

  /** @param channel Serveur que Squirrel doit interroger */
  #useChannel(channel: UpdateChannel): void {
    if (this.#channel === channel) return;

    this.#deps.setFeed?.(channel);
    this.#channel = channel;
  }

  #set(patch: Partial<UpdateState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#deps.onChange(this.state);
  }
}
