/**
 * Politique de permissions des sites tiers.
 *
 * - `ALLOWED` : accordées sans question (notifications, plein écran, DRM...).
 * - `ASKABLE_PERMISSIONS` : demandent une confirmation, mémorisée durablement
 *   dans le `PermissionStore`.
 * - Tout le reste est refusé.
 */

const { ASKABLE_PERMISSIONS } = require('./PermissionStore.js');

const ALLOWED = Object.freeze(
  new Set([
    'notifications',
    'fullscreen',
    'pointerLock',
    'clipboard-sanitized-write',
    'mediaKeySystem', // DRM (Spotify, Netflix...)
    'speaker-selection',
  ]),
);

const ASK = Object.freeze(new Set(ASKABLE_PERMISSIONS));

/**
 * @param {string} url
 * @returns {?string}
 */
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch (error) {
    return null;
  }
}

/**
 * @param {Object} deps
 * @param {import('./PermissionStore.js').PermissionStore} deps.store
 * @param {(origin: string, permission: string) => Promise<boolean>} deps.ask
 *   Interroge l'utilisateur ; `true` si autorisé
 * @param {(url: string) => boolean} deps.isSafeUrl
 * @returns {{
 *   check: (contents: any, permission: string, requestingOrigin: string) => boolean,
 *   request: (contents: any, permission: string, callback: (allowed: boolean) => void, details?: any) => Promise<void>
 * }} Les deux handlers de `Electron.Session`
 */
function createPermissionPolicy({ store, ask, isSafeUrl }) {
  /** Demandes en cours : un même couple origine/permission ne pose qu'une question. */
  const pending = new Map();

  const check = (_contents, permission, requestingOrigin) => {
    if (ALLOWED.has(permission)) return true;
    if (ASK.has(permission))
      return store.get(requestingOrigin, permission) === true;
    return false;
  };

  const request = async (contents, permission, callback, details) => {
    if (ALLOWED.has(permission)) return callback(true);
    if (!ASK.has(permission)) return callback(false);

    const origin = originOf(details?.requestingUrl ?? contents?.getURL?.());
    if (!origin || !isSafeUrl(origin)) return callback(false);

    const known = store.get(origin, permission);
    if (known !== undefined) return callback(known);

    const key = `${origin}|${permission}`;
    if (!pending.has(key)) {
      pending.set(
        key,
        Promise.resolve()
          .then(() => ask(origin, permission))
          .then((allowed) => {
            // Seul un « oui » explicite autorise ; une erreur ne mémorise rien
            const decision = allowed === true;
            store.set(origin, permission, decision);
            return decision;
          })
          .finally(() => pending.delete(key)),
      );
    }

    try {
      callback(await pending.get(key));
    } catch (error) {
      console.error('Demande de permission impossible', error);
      callback(false);
    }
  };

  return { check, request };
}

module.exports = { createPermissionPolicy, ALLOWED, ASK };
