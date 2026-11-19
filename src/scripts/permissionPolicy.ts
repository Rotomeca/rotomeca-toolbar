/**
 * Politique de permissions des sites tiers.
 *
 * - `ALLOWED` : accordées sans question (notifications, plein écran, DRM...).
 * - `ASKABLE_PERMISSIONS` : demandent une confirmation, mémorisée durablement
 *   dans le `PermissionStore`.
 * - Tout le reste est refusé.
 */

import { ASKABLE_PERMISSIONS } from './PermissionStore.js';
import type { PermissionStore } from './PermissionStore.js';

export const ALLOWED: ReadonlySet<string> = new Set([
  'notifications',
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write',
  'mediaKeySystem', // DRM (Spotify, Netflix...)
  'speaker-selection',
]);

export const ASK: ReadonlySet<string> = new Set(ASKABLE_PERMISSIONS);

/** Ce que la politique lit d'une page : seulement son adresse. */
interface PageLike {
  getURL?(): string;
}

/** Ce que la politique lit des détails d'une demande d'Electron. */
interface RequestDetails {
  requestingUrl?: string;
}

export interface PermissionPolicyDependencies {
  /** Seules la lecture et l'écriture d'une décision servent ici. */
  readonly store: Pick<PermissionStore, 'get' | 'set'>;
  /** Interroge l'utilisateur ; `true` s'il autorise. */
  readonly ask: (origin: string, permission: string) => Promise<boolean>;
  readonly isSafeUrl: (url: string) => boolean;
}

/** Les deux gestionnaires à installer sur une `Electron.Session`. */
export interface PermissionPolicy {
  check(contents: unknown, permission: string, requestingOrigin: string): boolean;
  request(
    contents: PageLike | null | undefined,
    permission: string,
    callback: (allowed: boolean) => void,
    details?: RequestDetails,
  ): Promise<void>;
}

function originOf(url: string | undefined): string | null {
  if (url === undefined) return null;

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function createPermissionPolicy({ store, ask, isSafeUrl }: PermissionPolicyDependencies): PermissionPolicy {
  /** Demandes en cours : un même couple origine/permission ne pose qu'une question. */
  const pending = new Map<string, Promise<boolean>>();

  /** Pose la question puis mémorise la réponse ; seul un « oui » explicite autorise. */
  async function askAndRemember(origin: string, permission: string): Promise<boolean> {
    const allowed = (await ask(origin, permission)) === true;
    store.set(origin, permission, allowed);
    return allowed;
  }

  function check(_contents: unknown, permission: string, requestingOrigin: string): boolean {
    if (ALLOWED.has(permission)) return true;
    if (ASK.has(permission)) return store.get(requestingOrigin, permission) === true;
    return false;
  }

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
