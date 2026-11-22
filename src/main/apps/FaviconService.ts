/**
 * Service des icônes de sites : cherche, garde en mémoire et enregistre sur disque.
 *
 * Utilisé par `App` pour répondre à la page de la barre. Le réseau, le disque et l'horloge sont injectés.
 * Une icône trouvée est gardée 14 jours, l'absence d'icône 6 heures (pour ne pas réinterroger un site sans icône à chaque
 * démarrage). Un site qui ne répond pas n'est pas mémorisé : la recherche est refaite à la demande suivante.
 */
// [favicon.ts] Recherche de l'icône d'un site : lecture de sa page, classement des icônes déclarées, téléchargement
import { FaviconNetworkError, findFavicon } from './favicon.js';
import type { FaviconFetch } from './favicon.js';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../../scripts/safeUrl.js';

/** Durée de validité d'une icône trouvée. */
export const FOUND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Durée de validité de l'absence d'icône. */
export const MISSING_TTL_MS = 6 * 60 * 60 * 1000;

/** Ce qui est enregistré pour un site. */
interface CacheEntry {
  /** Icône en `data:`, `null` si le site n'en a pas. */
  readonly icon: string | null;
  /** Date de la recherche (ms). */
  readonly at: number;
}

/** Où le cache est enregistré. */
export interface FaviconRepository {
  /** @returns Les données enregistrées, ou `false` s'il n'y en a pas */
  loadAsync(): Promise<unknown>;
  /** Enregistre les données. */
  save(data: unknown): void;
}

/** Collaborateurs du service. */
export interface FaviconDeps {
  readonly fetch: FaviconFetch;
  readonly repository: FaviconRepository;
  readonly now: () => number;
  /** Essaie d'abord `/favicon.ico` puis un service d'icônes (rapide) avant de lire la page du site ; vrai par défaut. */
  readonly fast?: boolean;
}

/** Nom du fichier de cache (le suffixe change si la façon de chercher invalide les anciens échecs). */
export const CACHE_FILE = 'favicons.v2.json';

/** Garde les icônes des sites : une recherche par site à la fois, résultat réutilisé tant qu'il est valide. */
export class FaviconService {
  readonly #deps: FaviconDeps;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #pending = new Map<string, Promise<string | null>>();
  #loaded: Promise<void> | null = null;

  /** @param deps Réseau, enregistrement et horloge */
  constructor(deps: FaviconDeps) {
    this.#deps = deps;
  }

  /**
   * @param siteUrl Adresse de l'application
   * @returns L'icône du site en `data:`, `null` si le site n'en a pas ou si l'adresse est invalide
   */
  async resolve(siteUrl: string): Promise<string | null> {
    // Une adresse qui n'est pas http(s) (blob:, file:…) n'a pas d'icône et ne doit pas créer d'entrée de cache
    if (!isSafeUrl(siteUrl)) return null;

    const { origin } = new URL(siteUrl);

    await (this.#loaded ??= this.#load());

    const entry = this.#entries.get(origin);
    if (entry && this.#deps.now() - entry.at < (entry.icon ? FOUND_TTL_MS : MISSING_TTL_MS)) return entry.icon;

    // Plusieurs boutons du même site partagent une seule recherche
    const running = this.#pending.get(origin);
    if (running) return running;

    const search = this.#search(origin, siteUrl).finally(() => this.#pending.delete(origin));
    this.#pending.set(origin, search);
    return search;
  }

  /** Cherche l'icône, l'enregistre et la renvoie ; une erreur imprévue est comptée comme un échec. */
  async #search(origin: string, siteUrl: string): Promise<string | null> {
    let icon: string | null = null;
    try {
      icon = await findFavicon(siteUrl, this.#deps.fetch, { fast: this.#deps.fast ?? true });
    } catch (error) {
      // Site injoignable : ne rien mémoriser, une prochaine demande réessaiera
      if (error instanceof FaviconNetworkError) return null;
      console.error('Favicon lookup failed', error);
    }

    this.#entries.set(origin, { icon, at: this.#deps.now() });
    try {
      this.#deps.repository.save(Object.fromEntries(this.#entries));
    } catch (error) {
      console.error('Favicon cache not saved', error);
    }
    return icon;
  }

  /** Lit le cache enregistré ; ce qui n'a pas la bonne forme est ignoré. */
  async #load(): Promise<void> {
    const data = await this.#deps.repository.loadAsync();
    if (typeof data !== 'object' || data === null) return;

    for (const [origin, value] of Object.entries(data)) {
      const { icon, at } = (value ?? {}) as Partial<CacheEntry>;
      const validIcon = icon === null || (typeof icon === 'string' && icon.startsWith('data:image/'));
      if (validIcon && typeof at === 'number') this.#entries.set(origin, { icon, at });
    }
  }
}
