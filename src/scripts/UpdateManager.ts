/**
 * Gestionnaire de mises à jour : Squirrel, GitHub (Linux) et canal de pré-versions.
 *
 * Utilisé par le processus principal, qui injecte Squirrel, le réseau et les
 * notifications (aucune dépendance à `electron`, donc testable).
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

// [githubReleases.ts] Lecture des releases GitHub : dernière release et pré-version la plus récente
import {
  fetchLatestRelease,
  fetchRecentReleases,
  findNewestPrerelease,
} from './githubReleases.js';
import type { HttpFetch } from './githubReleases.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { UpdateChannel, UpdateStage, UpdateState } from '../shared/dto.js';
// [versions.ts] Numéros de version : comparaison et détection des pré-versions (`X.Y.Z-rcN`)
import { isPrerelease } from './versions.js';

/** Intervalle entre deux vérifications automatiques (une heure). */
export const CHECK_INTERVAL = 60 * 60 * 1000;

/** Clé de texte : le serveur de test ne propose pas encore la pré-version (cache de Hazel). */
const TEST_FEED_STALE_ERROR = 'update.test.errorUnavailable';
/** Clé de texte : la vérification a échoué. */
const CHECK_ERROR = 'update.card.errorCheck';
/** Clé de texte : le téléchargement ou l'installation a échoué. */
const DOWNLOAD_ERROR = 'update.card.errorDownload';

/** `available` n'existe que sous Linux (mise à jour manuelle). */
export type { UpdateChannel, UpdateStage, UpdateState };

/**
 * Ce que le gestionnaire attend de Squirrel (`Electron.autoUpdater` convient).
 * Signatures de méthodes : les écouteurs d'Electron reçoivent plus d'arguments.
 */
export interface SquirrelUpdater {
  /** Écoute la découverte (ou l'absence) d'une version. */
  on(event: 'update-available' | 'update-not-available', listener: () => void): unknown;
  /** Écoute la fin du téléchargement ; `releaseName` n'est renseigné que sur macOS. */
  on(event: 'update-downloaded', listener: (event: unknown, notes: string, releaseName: string) => void): unknown;
  /** Écoute les erreurs de vérification ou de téléchargement. */
  on(event: 'error', listener: (error: Error) => void): unknown;
  /** Interroge le serveur de mises à jour ; le téléchargement démarre seul si une version existe. */
  checkForUpdates(): void;
  /** Quitte l'application et installe la version téléchargée. */
  quitAndInstall(): void;
}

/** Tout ce que le gestionnaire reçoit de l'extérieur (Squirrel, réseau, système, fenêtres). */
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
  /** Requête HTTP vers l'API GitHub. */
  readonly fetch: HttpFetch;
  /** Ouvre une adresse dans le navigateur par défaut. */
  readonly openExternal: (url: string) => void;
  /** Compare deux versions : négatif, nul ou positif comme un tri. */
  readonly compareVersions: (a: string, b: string) => number;
  /** Sauvegardes avant le redémarrage. */
  readonly beforeInstall: () => void;
  /** Change le serveur interrogé par Squirrel. */
  readonly setFeed?: ((channel: UpdateChannel) => void) | null;
  /** Un serveur de mises à jour pour les pré-versions existe. */
  readonly testFeed?: boolean;
  /** Appelé à chaque changement d'état (renvoyé à la fenêtre Paramètres). */
  readonly onChange: (state: UpdateState) => void;
  /** Notification système. */
  readonly notifyReady: (version: string | null) => void;
}

/** États pendant lesquels une nouvelle vérification ne doit pas être lancée. */
const IN_PROGRESS: readonly UpdateStage[] = ['downloading', 'ready'];

/** Machine d'états des mises à jour : vérifie, télécharge, propose l'installation et publie l'état. */
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

  /**
   * Prépare l'état initial (« à jour ») sans rien lancer ; voir {@link UpdateManager.start}.
   * @param deps Dépendances injectées
   */
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

  /** Copie de l'état courant, que la fenêtre Paramètres affiche telle quelle. */
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

  /** Lance la vérification adaptée au mode : simulation, GitHub (Linux) ou Squirrel (canal stable). */
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

  /**
   * @returns Squirrel
   * @throws {Error} Si Squirrel n'est pas utilisable dans cet environnement
   */
  #requireUpdater(): SquirrelUpdater {
    if (!this.#deps.autoUpdater) throw new Error('Squirrel n\'est pas utilisable dans cet environnement');
    return this.#deps.autoUpdater;
  }

  /** Branche les évènements de Squirrel sur l'état ; sans effet sous Linux, en simulation ou sans Squirrel. */
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

  /** Squirrel ne trouve rien : « à jour », ou erreur dédiée si on cherchait sur le serveur de test. */
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

  /**
   * Passe à « prête » et notifie l'utilisateur.
   * @param releaseName Nom de version fourni par Squirrel (macOS seulement)
   */
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

  /**
   * Compare la dernière release GitHub à la version courante (mode manuel, Linux).
   * @throws {Error} Si aucun dépôt de releases n'est configuré, ou si GitHub répond mal
   */
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

  /**
   * Fusionne un changement dans l'état et le publie.
   * @param patch Champs à modifier
   */
  #set(patch: Partial<UpdateState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#deps.onChange(this.state);
  }
}
