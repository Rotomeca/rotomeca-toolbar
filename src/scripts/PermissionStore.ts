/**
 * Mémoire durable des décisions de permissions (caméra/micro, localisation)
 * prises pour les sites tiers. Une décision porte sur un couple
 * (origine, permission) et vaut « autorisé » ou « refusé » jusqu'à révocation.
 *
 * Le fichier est modifiable à la main : tout ce qui est lu est revalidé,
 * une entrée invalide est ignorée plutôt que d'accorder quoi que ce soit.
 */

/** Permissions qui demandent une confirmation (et donc qu'on mémorise). */
export const ASKABLE_PERMISSIONS = ['media', 'geolocation'] as const;

export type AskablePermission = (typeof ASKABLE_PERMISSIONS)[number];

const FORMAT_VERSION = 1;

export interface PermissionDecision {
  readonly origin: string;
  readonly permission: AskablePermission;
  readonly allowed: boolean;
}

/** Contenu du fichier enregistré. */
export interface PermissionFile {
  readonly version: number;
  readonly decisions: readonly PermissionDecision[];
}

/** Support de stockage : le fichier sur disque en production, une mémoire dans les tests. */
export interface PermissionStorage {
  /** @returns Les données enregistrées, `false` ou `null` s'il n'y en a pas (contenu non fiable) */
  load(): unknown;
  save(data: PermissionFile): void;
}

/** Une décision identifiée : origine normalisée, permission reconnue et clé d'unicité. */
interface DecisionIdentity {
  readonly key: string;
  readonly origin: string;
  readonly permission: AskablePermission;
}

function isAskablePermission(value: unknown): value is AskablePermission {
  return ASKABLE_PERMISSIONS.some((permission) => permission === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** @returns L'origine http(s) normalisée, ou null si la valeur n'en est pas une */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

/** @returns L'identité de la décision, ou null si l'origine ou la permission est invalide */
function identify(origin: unknown, permission: unknown): DecisionIdentity | null {
  const normalized = normalizeOrigin(origin);
  if (normalized === null || !isAskablePermission(permission)) return null;

  return { key: `${normalized}|${permission}`, origin: normalized, permission };
}

export class PermissionStore {
  readonly #decisions = new Map<string, PermissionDecision>();
  readonly #storage: PermissionStorage;

  constructor(storage: PermissionStorage) {
    this.#storage = storage;
    this.#load();
  }

  /** @returns La décision enregistrée, ou `undefined` s'il n'y en a aucune */
  get(origin: string, permission: string): boolean | undefined {
    const identity = identify(origin, permission);
    return identity ? this.#decisions.get(identity.key)?.allowed : undefined;
  }

  /** @returns false si le couple est invalide (rien n'est enregistré) */
  set(origin: string, permission: string, allowed: boolean): boolean {
    const identity = identify(origin, permission);
    // Les appelants viennent de pages non fiables : on revérifie le type à l'exécution
    if (!identity || typeof allowed !== 'boolean') return false;

    this.#decisions.set(identity.key, {
      origin: identity.origin,
      permission: identity.permission,
      allowed,
    });
    this.#persist();
    return true;
  }

  /**
   * Oublie une décision : le site sera de nouveau interrogé.
   * @returns true si une décision a été supprimée
   */
  revoke(origin: string, permission: string): boolean {
    const identity = identify(origin, permission);
    if (!identity || !this.#decisions.delete(identity.key)) return false;

    this.#persist();
    return true;
  }

  /** Oublie toutes les décisions. */
  clear(): void {
    if (this.#decisions.size === 0) return;

    this.#decisions.clear();
    this.#persist();
  }

  /** @returns Une copie des décisions, triée par origine puis par permission */
  list(): PermissionDecision[] {
    return [...this.#decisions.values()]
      .map((decision) => ({ ...decision }))
      .sort(
        (a, b) =>
          a.origin.localeCompare(b.origin) ||
          a.permission.localeCompare(b.permission),
      );
  }

  #load(): void {
    let data: unknown;
    try {
      data = this.#storage.load();
    } catch (error) {
      console.error('Lecture des permissions impossible', error);
      return;
    }

    const entries: unknown[] = isRecord(data) && Array.isArray(data['decisions']) ? data['decisions'] : [];
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry['allowed'] !== 'boolean') continue;

      const identity = identify(entry['origin'], entry['permission']);
      if (!identity) continue;

      this.#decisions.set(identity.key, {
        origin: identity.origin,
        permission: identity.permission,
        allowed: entry['allowed'],
      });
    }
  }

  #persist(): void {
    try {
      this.#storage.save({ version: FORMAT_VERSION, decisions: this.list() });
    } catch (error) {
      // La décision reste valable pour cette session même si le disque échoue
      console.error('Enregistrement des permissions impossible', error);
    }
  }
}
