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

const { isPrerelease } = require('./versions.js');

const CHECK_INTERVAL = 60 * 60 * 1000;

/** Numéro de version d'une release publiée (`3.3.0`). */
const RELEASE_VERSION = /^\d+(\.\d+){0,2}$/;
/** Numéro de version d'une pré-version (`3.3.0` ou `3.3.0-rc1`). */
const PRERELEASE_VERSION = /^\d+(\.\d+){0,2}(-rc\d+)?$/;

/**
 * Lit une release GitHub : numéro de version (sans « v ») et page de la release.
 * N'accepte qu'un numéro de version et une page du dépôt, jamais une URL quelconque.
 * @param {any} release
 * @param {string} repo `propriétaire/dépôt`
 * @param {{allowPre?: boolean}} [options] `allowPre` : accepte aussi `X.Y.Z-rcN`
 * @returns {{version: string, page: string}}
 * @throws {Error} Si la réponse est inattendue
 */
function readRelease(release, repo, { allowPre = false } = {}) {
  const version = String(release?.tag_name ?? '').replace(/^v/i, '');
  const page = String(release?.html_url ?? '');
  const format = allowPre ? PRERELEASE_VERSION : RELEASE_VERSION;

  if (!format.test(version) || !page.startsWith(`https://github.com/${repo}/`))
    throw new Error('Réponse GitHub inattendue');

  return { version, page };
}

/**
 * @typedef {'uptodate'|'available'|'downloading'|'ready'} UpdateStage
 * `available` n'existe que sous Linux (mise à jour manuelle).
 */

/**
 * @typedef {Object} UpdateState
 * @property {UpdateStage} etat
 * @property {boolean} verification Vérification en cours
 * @property {string} versionActuelle
 * @property {boolean} prerelease La version installée est une pré-version (`X.Y.Z-rcN`)
 * @property {?string} versionDisponible
 * @property {?number} pourcentage `null` : progression inconnue (Squirrel)
 * @property {?number} derniereVerification Horodatage (ms) de la dernière vérification réussie
 * @property {?string} erreur Clé de traduction du dernier échec
 * @property {boolean} verificationTest Recherche d'une version de test en cours
 * @property {?string} versionTest Version de test plus récente que l'actuelle
 * @property {?number} derniereVerificationTest Horodatage (ms) de la dernière recherche réussie
 * @property {?string} erreurTest Clé de traduction du dernier échec lié à la version de test
 * @property {boolean} testAuto `installTest()` installe seule (sinon, ouvre la page)
 */

class UpdateManager {
  /** @type {UpdateState} */
  #state;
  #deps;
  #interval = null;
  #started = false;
  #notifiedVersion = null;
  #pageUrl = null;
  #testUrl = null;
  /** @type {'stable'|'test'} Serveur actuellement interrogé par Squirrel */
  #channel = 'stable';

  /**
   * @param {Object} deps
   * @param {string} deps.version Version courante
   * @param {?Electron.AutoUpdater} deps.autoUpdater `null` si Squirrel n'est pas utilisable
   * @param {?string} deps.releasesRepo Dépôt GitHub (Linux)
   * @param {boolean} deps.manual Mode Linux (vérification GitHub)
   * @param {boolean} deps.simulate Simule un cycle complet (développement)
   * @param {(url: string, init?: object) => Promise<Response>} deps.fetch
   * @param {(url: string) => void} deps.openExternal
   * @param {(a: string, b: string) => number} deps.compareVersions
   * @param {() => void} deps.beforeInstall Sauvegardes avant le redémarrage
   * @param {?(channel: 'stable'|'test') => void} deps.setFeed Change le serveur de Squirrel
   * @param {boolean} deps.testFeed Un serveur de mises à jour pour les pré-versions existe
   * @param {(state: UpdateState) => void} deps.onChange
   * @param {(version: string) => void} deps.notifyReady Notification système
   */
  constructor(deps) {
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
      testAuto: !!(
        deps.autoUpdater &&
        !deps.manual &&
        !deps.simulate &&
        deps.testFeed &&
        deps.setFeed
      ),
    };
  }

  /** @returns {boolean} La vérification est possible dans cet environnement */
  get enabled() {
    const { autoUpdater, manual, releasesRepo, simulate } = this.#deps;
    return simulate || !!autoUpdater || (manual && !!releasesRepo);
  }

  /** @returns {UpdateState} */
  get state() {
    return { ...this.#state };
  }

  /** Vérifie au démarrage puis toutes les heures. */
  start() {
    if (this.#started || !this.enabled) return;
    this.#started = true;

    this.#bindSquirrel();
    this.check();
    this.#interval = setInterval(() => this.check(), CHECK_INTERVAL);
    this.#interval.unref?.();
  }

  /** Lance une vérification immédiate (sans effet si une est en cours ou si l'état est avancé). */
  async check() {
    const s = this.#state;
    if (!this.enabled || s.verification || ['downloading', 'ready'].includes(s.etat))
      return;

    this.#set({ verification: true, erreur: null });

    const { simulate, manual } = this.#deps;
    try {
      if (simulate) await this.#simulate();
      else if (manual) await this.#checkGithub();
      else {
        this.#useChannel('stable');
        this.#deps.autoUpdater.checkForUpdates();
      }
    } catch (error) {
      this.#fail(error);
    }
  }

  /**
   * Installe la version de test trouvée par `checkTest()` : téléchargement et
   * installation comme une mise à jour normale (même état, même bouton « redémarrer »).
   * Sans serveur de test, ouvre la page de la release.
   */
  installTest() {
    const s = this.#state;
    if (!s.versionTest) return;

    if (!s.testAuto) {
      this.openTest();
      return;
    }
    if (s.verification || ['downloading', 'ready'].includes(s.etat)) return;

    this.#useChannel('test');
    this.#set({
      verification: true,
      erreur: null,
      erreurTest: null,
      versionDisponible: s.versionTest,
    });
    try {
      this.#deps.autoUpdater.checkForUpdates();
    } catch (error) {
      this.#fail(error);
    }
  }

  /** Installe (état prêt) ou ouvre la page de téléchargement (Linux). */
  install() {
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
    this.#deps.autoUpdater.quitAndInstall();
  }

  #bindSquirrel() {
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

    autoUpdater.on('update-not-available', () => {
      if (this.#channel === 'test') {
        // Le serveur de test met sa liste en cache (15 min par défaut) : la
        // pré-version trouvée sur GitHub n'y est peut-être pas encore
        this.#set({
          etat: 'uptodate',
          verification: false,
          erreur: null,
          versionDisponible: null,
          erreurTest: 'update.test.errorUnavailable',
        });
        return;
      }

      this.#set({
        etat: 'uptodate',
        verification: false,
        erreur: null,
        derniereVerification: Date.now(),
      });
    });

    autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
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
    });

    autoUpdater.on('error', (error) => this.#fail(error));
  }

  async #checkGithub() {
    const { releasesRepo, compareVersions, version } = this.#deps;

    const response = await this.#deps.fetch(
      `https://api.github.com/repos/${releasesRepo}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!response.ok) throw new Error(`GitHub ${response.status}`);

    // N'ouvrir que la page des versions du dépôt, jamais une URL quelconque
    const { version: latest, page } = readRelease(
      await response.json(),
      releasesRepo,
    );

    if (compareVersions(latest, version) > 0) {
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
    } else {
      this.#set({
        etat: 'uptodate',
        verification: false,
        derniereVerification: Date.now(),
      });
    }
  }

  /**
   * Cherche la plus récente pré-version GitHub, plus récente que la version
   * actuelle. Action volontaire : jamais lancée automatiquement, et sans effet
   * sur l'état des mises à jour normales.
   */
  async checkTest() {
    const { releasesRepo, compareVersions, version } = this.#deps;
    if (!releasesRepo || this.#state.verificationTest) return;

    this.#set({ verificationTest: true, erreurTest: null });
    try {
      const response = await this.#deps.fetch(
        `https://api.github.com/repos/${releasesRepo}/releases?per_page=30`,
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (!response.ok) throw new Error(`GitHub ${response.status}`);

      const releases = await response.json();
      if (!Array.isArray(releases)) throw new Error('Réponse GitHub inattendue');

      let best = null;
      for (const release of releases) {
        if (!release?.prerelease || release.draft) continue;

        let candidate;
        try {
          candidate = readRelease(release, releasesRepo, { allowPre: true });
        } catch (error) {
          continue; // Une release au format inattendu ne bloque pas les autres
        }

        if (compareVersions(candidate.version, version) <= 0) continue;
        if (!best || compareVersions(candidate.version, best.version) > 0)
          best = candidate;
      }

      this.#testUrl = best?.page ?? null;
      this.#set({
        verificationTest: false,
        versionTest: best?.version ?? null,
        derniereVerificationTest: Date.now(),
      });
    } catch (error) {
      console.error('Test update error', error);
      this.#set({
        verificationTest: false,
        erreurTest: 'update.card.errorCheck',
      });
    }
  }

  /** Ouvre la page de la version de test trouvée (téléchargement manuel). */
  openTest() {
    if (this.#testUrl) this.#deps.openExternal(this.#testUrl);
  }

  /** Cycle factice : vérification, téléchargement puis prête. */
  async #simulate() {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
   * @param {unknown} error
   */
  #fail(error) {
    console.error('Update error', error);
    const { etat } = this.#state;

    // Un téléchargement raté retombe sur « à jour » : une nouvelle vérification le relancera
    const next = etat === 'downloading' ? 'uptodate' : etat;
    const key =
      etat === 'uptodate' || etat === 'available'
        ? 'update.card.errorCheck'
        : 'update.card.errorDownload';

    // L'échec d'une installation de test s'affiche dans le bloc « Version de test »
    const failure =
      this.#channel === 'test'
        ? { erreur: null, erreurTest: key, ...(next === 'uptodate' && { versionDisponible: null }) }
        : { erreur: key };

    this.#set({
      etat: next,
      verification: false,
      pourcentage: null,
      ...failure,
    });
  }

  /**
   * @param {'stable'|'test'} channel Serveur que Squirrel doit interroger
   */
  #useChannel(channel) {
    if (this.#channel === channel) return;
    this.#deps.setFeed?.(channel);
    this.#channel = channel;
  }

  /** @param {Partial<UpdateState>} patch */
  #set(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#deps.onChange(this.state);
  }
}

module.exports = { UpdateManager, CHECK_INTERVAL };
