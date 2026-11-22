/**
 * Politique de permissions des sites tiers : accorder, demander ou refuser.
 *
 * Utilisé par le processus principal, qui installe `check` et `request` sur la
 * session des sites. Sans `electron` : le registre, la question à l'utilisateur
 * et le contrôle d'URL sont injectés.
 *
 * - `ALLOWED` : accordées sans question (notifications, DRM...).
 * - `ASKABLE_PERMISSIONS` : demandent une confirmation, mémorisée durablement
 *   dans le `PermissionStore`.
 * - Tout le reste est refusé.
 */

// [PermissionStore.ts] Mémoire durable des décisions de permissions (caméra/micro, localisation) des sites tiers
import { ASKABLE_PERMISSIONS } from './PermissionStore.js';
import type { PermissionStore } from './PermissionStore.js';

/** Permissions accordées sans question à tous les sites. */
export const ALLOWED: ReadonlySet<string> = new Set([
  'notifications',
  'pointerLock',
  'clipboard-sanitized-write',
  'mediaKeySystem', // DRM (Spotify, Netflix...)
  'speaker-selection',
]);

/** Permissions qui passent par une confirmation de l'utilisateur. */
export const ASK:ReadonlySet<string> = new Set(ASKABLE_PERMISSIONS);

/** Ce que la politique lit d'une page : seulement son adresse. */
interface PageLike {
  getURL?(): string;
}

/** Ce que la politique lit des détails d'une demande d'Electron. */
interface RequestDetails {
  requestingUrl?: string;
}

/** Dépendances injectées dans la politique. */
export interface PermissionPolicyDependencies {
  /** Seules la lecture et l'écriture d'une décision servent ici. */
  readonly store: Pick<PermissionStore, 'get' | 'set'>;
  /** Interroge l'utilisateur ; `true` s'il autorise. */
  readonly ask: (origin: string, permission: string) => Promise<boolean>;
  /** Contrôle qu'une adresse est http(s) (voir `safeUrl`). */
  readonly isSafeUrl: (url: string) => boolean;
}

/** Les deux gestionnaires à installer sur une `Electron.Session`. */
export interface PermissionPolicy {
  /** Répond de façon synchrone : accordée d'office, ou déjà autorisée par une décision mémorisée. */
  check(contents: unknown, permission: string, requestingOrigin: string): boolean;
  /** Répond à une demande : directement si possible, sinon après avoir interrogé l'utilisateur. */
  request(
    contents: PageLike | null | undefined,
    permission: string,
    callback: (allowed: boolean) => void,
    details?: RequestDetails,
  ): Promise<void>;
}

/**
 * @param url Adresse du demandeur
 * @returns Son origine, ou null si l'adresse est absente ou invalide
 */
function originOf(url: string | undefined): string | null {
  if (url === undefined) return null;

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Construit la politique de permissions.
 * @param dependencies Registre des décisions, question à l'utilisateur et contrôle d'URL
 * @returns Les gestionnaires `check` et `request` à installer sur la session
 */
export function createPermissionPolicy({ store, ask, isSafeUrl }: PermissionPolicyDependencies): PermissionPolicy {
  /** Demandes en cours : un même couple origine/permission ne pose qu'une question. */
  const pending = new Map<string, Promise<boolean>>();

  /** Pose la question puis mémorise la réponse ; seul un « oui » explicite autorise. */
  async function askAndRemember(origin: string, permission: string): Promise<boolean> {
    const allowed = (await ask(origin, permission)) === true;
    store.set(origin, permission, allowed);
    return allowed;
  }

  /** Voir {@link PermissionPolicy.check}. */
  function check(_contents: unknown, permission: string, requestingOrigin: string): boolean {
    if (ALLOWED.has(permission)) return true;
    if (ASK.has(permission)) return store.get(requestingOrigin, permission) === true;
    return false;
  }

  /** Voir {@link PermissionPolicy.request} ; en cas d'erreur, refuse sans rien mémoriser. */
  async function request(
    contents: PageLike | null | undefined,
    permission: string,
    callback: (allowed: boolean) => void,
    details?: RequestDetails,
  ): Promise<void> {
    if (ALLOWED.has(permission)) return callback(true);
    if (!ASK.has(permission)) return callback(false);

    const origin = originOf(details?.requestingUrl ?? contents?.getURL?.());
    if (origin === null || !isSafeUrl(origin)) return callback(false);

    const known = store.get(origin, permission);
    if (known !== undefined) return callback(known);

    const key = `${origin}|${permission}`;
    let decision = pending.get(key);
    if (!decision) {
      decision = askAndRemember(origin, permission).finally(() => pending.delete(key));
      pending.set(key, decision);
    }

    try {
      callback(await decision);
    } catch (error) {
      // Une erreur (boîte de dialogue détruite...) refuse sans rien mémoriser
      console.error('Demande de permission impossible', error);
      callback(false);
    }
  }

  return { check, request };
}
