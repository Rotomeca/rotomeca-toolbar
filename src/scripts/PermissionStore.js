/**
 * Mémoire durable des décisions de permissions (caméra/micro, localisation)
 * prises pour les sites tiers. Une décision porte sur un couple
 * (origine, permission) et vaut « autorisé » ou « refusé » jusqu'à révocation.
 *
 * Le fichier est modifiable à la main : tout ce qui est lu est revalidé,
 * une entrée invalide est ignorée plutôt que d'accorder quoi que ce soit.
 */

/** Permissions qui demandent une confirmation (et donc qu'on mémorise). */
const ASKABLE_PERMISSIONS = Object.freeze(['media', 'geolocation']);

const FORMAT_VERSION = 1;

/**
 * @param {unknown} value
 * @returns {?string} L'origine http(s) normalisée, ou null
 */
function normalizeOrigin(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch (error) {
    return null;
  }
}

/**
 * @typedef {Object} PermissionDecision
 * @property {string} origin
 * @property {string} permission
 * @property {boolean} allowed
 */

/**
 * @typedef {Object} PermissionStorage
 * @property {() => any} load Données enregistrées, `false`/`null` si aucune
 * @property {(data: object) => void} save
 */

class PermissionStore {
  /** @type {Map<string, PermissionDecision>} */
  #decisions = new Map();
  #storage;

  /** @param {PermissionStorage} storage */
  constructor(storage) {
    this.#storage = storage;
    this.#load();
  }

  /**
   * @param {string} origin
   * @param {string} permission
   * @returns {boolean|undefined} `undefined` : aucune décision enregistrée
   */
  get(origin, permission) {
    const key = this.#keyOf(origin, permission);
    return key ? this.#decisions.get(key)?.allowed : undefined;
  }

  /**
   * @param {string} origin
   * @param {string} permission
   * @param {boolean} allowed
   * @returns {boolean} false si le couple est invalide (rien n'est enregistré)
   */
  set(origin, permission, allowed) {
    const key = this.#keyOf(origin, permission);
    if (!key || typeof allowed !== 'boolean') return false;

    this.#decisions.set(key, {
      origin: normalizeOrigin(origin),
      permission,
      allowed,
    });
    this.#persist();
    return true;
  }

  /**
   * Oublie une décision : le site sera de nouveau interrogé.
   * @param {string} origin
   * @param {string} permission
   * @returns {boolean} true si une décision a été supprimée
   */
  revoke(origin, permission) {
    const key = this.#keyOf(origin, permission);
    if (!key || !this.#decisions.delete(key)) return false;

    this.#persist();
    return true;
  }

  /** Oublie toutes les décisions. */
  clear() {
    if (this.#decisions.size === 0) return;
    this.#decisions.clear();
    this.#persist();
  }

  /** @returns {PermissionDecision[]} Copie triée par origine puis permission */
  list() {
    return [...this.#decisions.values()]
      .map((decision) => ({ ...decision }))
      .sort(
        (a, b) =>
          a.origin.localeCompare(b.origin) ||
          a.permission.localeCompare(b.permission),
      );
  }

  /**
   * @param {string} origin
   * @param {string} permission
   * @returns {?string} Clé interne, ou null si le couple est invalide
   */
  #keyOf(origin, permission) {
    const normalized = normalizeOrigin(origin);
    if (!normalized || !ASKABLE_PERMISSIONS.includes(permission)) return null;
    return `${normalized}|${permission}`;
  }

  #load() {
    let data;
    try {
      data = this.#storage.load();
    } catch (error) {
      console.error('Lecture des permissions impossible', error);
      return;
    }

    const entries = Array.isArray(data?.decisions) ? data.decisions : [];
    for (const entry of entries) {
      const key = this.#keyOf(entry?.origin, entry?.permission);
      if (!key || typeof entry.allowed !== 'boolean') continue;

      this.#decisions.set(key, {
        origin: normalizeOrigin(entry.origin),
        permission: entry.permission,
        allowed: entry.allowed,
      });
    }
  }

  #persist() {
    try {
      this.#storage.save({
        version: FORMAT_VERSION,
        decisions: this.list(),
      });
    } catch (error) {
      // La décision reste valable pour cette session même si le disque échoue
      console.error('Enregistrement des permissions impossible', error);
    }
  }
}

module.exports = { PermissionStore, ASKABLE_PERMISSIONS, normalizeOrigin };
