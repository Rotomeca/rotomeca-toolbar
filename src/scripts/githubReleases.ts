/**
 * Lecture des releases GitHub : dernière release et pré-version la plus récente.
 *
 * Utilisé par `UpdateManager` (Linux et canal de test). Les réponses de l'API sont
 * des données non fiables : rien n'est supposé, et seul un numéro de version et une
 * page du dépôt sont retenus. Le réseau est injecté, donc testable sans Electron.
 */

/** Numéro de version d'une release publiée (`3.3.0`). */
const RELEASE_VERSION = /^\d+(\.\d+){0,2}$/;
/** Numéro de version d'une pré-version (`3.3.0` ou `3.3.0-rc1`). */
const PRERELEASE_VERSION = /^\d+(\.\d+){0,2}(-rc\d+)?$/;

/** En-têtes demandés à l'API GitHub. */
const API_HEADERS = { Accept: 'application/vnd.github+json' } as const;
/** Nombre de releases lues pour chercher une pré-version (les plus récentes). */
const RELEASES_PER_PAGE = 30;

/** Release retenue après validation : seules ces deux informations sont gardées. */
export interface ReleaseInfo {
  /** Numéro de version, sans « v ». */
  readonly version: string;
  /** Page de la release, toujours sur le dépôt demandé. */
  readonly page: string;
}

/** Ce que l'on lit d'une réponse HTTP (compatible avec `Response` et `net.fetch`). */
export interface HttpResponse {
  /** true si le code HTTP est un succès (2xx). */
  readonly ok: boolean;
  /** Code HTTP de la réponse. */
  readonly status: number;
  /** Corps décodé en JSON (contenu non fiable). */
  json(): Promise<unknown>;
}

/** Requête HTTP injectée (`net.fetch` en production, simulation dans les tests). */
export type HttpFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<HttpResponse>;

/** Réponse de GitHub en erreur ou dans un format inattendu. */
export class GithubResponseError extends Error {
  /** @param message Description de l'erreur */
  constructor(message: string) {
    super(message);
    this.name = 'GithubResponseError';
  }
}

/** @returns true si la valeur est un objet non nul (donc lisible par clé) */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Lit une release : numéro de version et page. N'accepte qu'un numéro de version et
 * une page du dépôt, jamais une URL quelconque.
 * @param release Release telle que GitHub la renvoie (non fiable)
 * @param repo Dépôt attendu (`propriétaire/dépôt`)
 * @param options `allowPre` accepte aussi les pré-versions `X.Y.Z-rcN`
 * @returns Le numéro de version et la page de la release
 * @throws {GithubResponseError} Si la release a un format inattendu
 */
export function readRelease(release: unknown, repo: string, { allowPre = false } = {}): ReleaseInfo {
  const record = isRecord(release) ? release : {};
  const version = String(record['tag_name'] ?? '').replace(/^v/i, '');
  const page = String(record['html_url'] ?? '');
  const format = allowPre ? PRERELEASE_VERSION : RELEASE_VERSION;

  if (!format.test(version) || !page.startsWith(`https://github.com/${repo}/`))
    throw new GithubResponseError('Réponse GitHub inattendue');

  return { version, page };
}

/**
 * Interroge l'API GitHub et décode la réponse.
 * @param fetch Requête HTTP injectée
 * @param url Adresse de l'API
 * @returns Le JSON de la réponse (non fiable)
 * @throws {GithubResponseError} Si GitHub répond avec un code d'erreur
 */
async function getJson(fetch: HttpFetch, url: string): Promise<unknown> {
  const response = await fetch(url, { headers: API_HEADERS });
  if (!response.ok) throw new GithubResponseError(`GitHub ${response.status}`);

  return response.json();
}

/**
 * @param fetch Requête HTTP injectée
 * @param repo Dépôt des releases (`propriétaire/dépôt`)
 * @returns La dernière release publiée (les pré-versions n'en font jamais partie)
 * @throws {GithubResponseError} Si GitHub répond en erreur ou dans un format inattendu
 */
export async function fetchLatestRelease(fetch: HttpFetch, repo: string): Promise<ReleaseInfo> {
  return readRelease(await getJson(fetch, `https://api.github.com/repos/${repo}/releases/latest`), repo);
}

/**
 * @param fetch Requête HTTP injectée
 * @param repo Dépôt des releases (`propriétaire/dépôt`)
 * @returns Les releases les plus récentes, publiées ou non, telles que GitHub les renvoie
 * @throws {GithubResponseError} Si GitHub répond en erreur ou si la réponse n'est pas une liste
 */
export async function fetchRecentReleases(fetch: HttpFetch, repo: string): Promise<unknown[]> {
  const releases = await getJson(fetch, `https://api.github.com/repos/${repo}/releases?per_page=${RELEASES_PER_PAGE}`);
  if (!Array.isArray(releases)) throw new GithubResponseError('Réponse GitHub inattendue');

  return releases;
}

/**
 * Cherche, parmi des releases, la pré-version la plus récente et plus récente que la
 * version actuelle. Brouillons, versions publiées et formats inattendus sont ignorés.
 * @param releases Releases telles que GitHub les renvoie (non fiables)
 * @param repo Dépôt attendu (`propriétaire/dépôt`)
 * @param currentVersion Version actuelle de l'application
 * @param compareVersions Comparateur de versions (voir `versions.ts`)
 * @returns La pré-version trouvée, ou null s'il n'y en a aucune
 */
export function findNewestPrerelease(
  releases: readonly unknown[],
  repo: string,
  currentVersion: string,
  compareVersions: (a: string, b: string) => number,
): ReleaseInfo | null {
  let best: ReleaseInfo | null = null;

  for (const release of releases) {
    if (!isRecord(release) || !release['prerelease'] || release['draft']) continue;

    const candidate = parsePrerelease(release, repo);
    if (!candidate || compareVersions(candidate.version, currentVersion) <= 0) continue;
    if (!best || compareVersions(candidate.version, best.version) > 0) best = candidate;
  }

  return best;
}

/**
 * @param release Release telle que GitHub la renvoie (non fiable)
 * @param repo Dépôt attendu (`propriétaire/dépôt`)
 * @returns La release, ou null si son format est inattendu (elle ne bloque pas les autres)
 */
function parsePrerelease(release: unknown, repo: string): ReleaseInfo | null {
  try {
    return readRelease(release, repo, { allowPre: true });
  } catch (error) {
    if (error instanceof GithubResponseError) return null;
    throw error;
  }
}
