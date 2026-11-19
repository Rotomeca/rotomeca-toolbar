/**
 * Mises à jour de l'application, côté processus principal.
 *
 * - Windows / macOS : Squirrel (`autoUpdater`). Le téléchargement démarre dès qu'une
 *   version est trouvée ; Squirrel n'expose aucune progression, la barre est donc
 *   indéterminée.
 * - Linux : pas d'installation automatique ; on compare avec la dernière release GitHub
 *   et l'action ouvre la page de téléchargement.
 *
 * L'état complet est renvoyé à la fenêtre Paramètres à chaque changement, la fenêtre
 * ne fait qu'afficher et déclencher « rechercher » / « mettre à jour ».
 */

const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * @typedef {'uptodate'|'available'|'downloading'|'ready'} UpdateStage
 * `available` n'existe que sous Linux (mise à jour manuelle).
 */

/**
 * @typedef {Object} UpdateState
 * @property {UpdateStage} etat
 * @property {boolean} verification Vérification en cours
 * @property {string} versionActuelle
 * @property {?string} versionDisponible
 * @property {?number} pourcentage `null` : progression inconnue (Squirrel)
 * @property {?number} derniereVerification Horodatage (ms) de la dernière vérification réussie
 * @property {?string} erreur Clé de traduction du dernier échec
 */

class UpdateManager {
  /** @type {UpdateState} */
  #state;
  #deps;
  #interval = null;
  #started = false;
  #notifiedVersion = null;
  #pageUrl = null;

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
   * @param {(state: UpdateState) => void} deps.onChange
   * @param {(version: string) => void} deps.notifyReady Notification système
   */
  constructor(deps) {
    this.#deps = deps;
    this.#state = {
      etat: 'uptodate',
      verification: false,
      versionActuelle: deps.version,
      versionDisponible: null,
      pourcentage: null,
      derniereVerification: null,
      erreur: null,
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
      else this.#deps.autoUpdater.checkForUpdates();
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

    const release = await response.json();
    const latest = String(release?.tag_name ?? '').replace(/^v/i, '');
    const page = String(release?.html_url ?? '');

    // N'ouvrir que la page des versions du dépôt, jamais une URL quelconque
    if (
      !/^\d+(\.\d+){0,2}$/.test(latest) ||
      !page.startsWith(`https://github.com/${releasesRepo}/`)
    )
      throw new Error('Réponse GitHub inattendue');

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

    this.#set({
      // Un téléchargement raté retombe sur « à jour » : une nouvelle vérification le relancera
      etat: etat === 'downloading' ? 'uptodate' : etat,
      verification: false,
      pourcentage: null,
      erreur: etat === 'uptodate' || etat === 'available' ? 'update.card.errorCheck' : 'update.card.errorDownload',
    });
  }

  /** @param {Partial<UpdateState>} patch */
  #set(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#deps.onChange(this.state);
  }
}

module.exports = { UpdateManager, CHECK_INTERVAL };
