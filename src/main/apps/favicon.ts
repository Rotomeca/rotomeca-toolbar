/**
 * Recherche de l'icône d'un site : lecture de sa page, classement des icônes déclarées, téléchargement.
 *
 * Utilisé par `FaviconService`. Pur, sans `electron` : le réseau est injecté (testable). Chaque icône
 * candidate est contrôlée (adresse http(s), type image, taille bornée) avant d'être renvoyée en `data:`.
 */
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../../scripts/safeUrl.js';

/** Ce qu'on lit d'une réponse HTTP. */
export interface FaviconResponse {
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** Requête HTTP GET injectée (`net.fetch` avec délai maximal côté Electron). */
export type FaviconFetch = (url: string) => Promise<FaviconResponse>;

/** Une icône déclarée par la page (`<link rel="icon">`). */
export interface IconCandidate {
  /** Adresse absolue de l'image. */
  readonly url: string;
  /** Plus grand côté déclaré en pixels ; 0 si la page ne le dit pas. */
  readonly size: number;
}

/** Taille maximale d'une page HTML lue (l'en-tête suffit). */
const MAX_HTML_LENGTH = 256 * 1024;
/** Taille maximale d'une icône conservée. */
const MAX_ICON_BYTES = 128 * 1024;
/** Nombre maximal d'icônes essayées pour un site. */
const MAX_ATTEMPTS = 6;
/** Taille au-delà de laquelle une icône plus grande n'est plus préférée (le bouton est petit). */
const PREFERRED_MAX_SIZE = 192;
/** Taille supposée d'une icône dont la page ne donne pas les dimensions. */
const UNKNOWN_SIZE = 32;
/** Taille supposée d'une icône vectorielle (`sizes="any"`). */
const VECTOR_SIZE = 512;

/** Relations `rel` qui désignent une icône de site. */
const ICON_RELS = ['icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed'];

/**
 * @param tag Une balise `<link ...>`
 * @returns Ses attributs en minuscules ; les entités `&amp;` de l'adresse sont décodées
 */
function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const [, name = '', quoted, single, bare] = match;
    attributes[name.toLowerCase()] = (quoted ?? single ?? bare ?? '').replaceAll('&amp;', '&');
  }

  return attributes;
}

/**
 * @param sizes Valeur de `sizes` (`16x16 32x32`, `any`)
 * @returns Le plus grand côté déclaré, 0 s'il n'y en a pas
 */
function largestSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (sizes.toLowerCase().includes('any')) return VECTOR_SIZE;

  return Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map(([, w = '0', h = '0']) => Math.max(Number(w), Number(h))));
}

/**
 * @param host Nom d'hôte d'une adresse
 * @returns `true` pour `localhost` ou une adresse IP privée : une page publique ne doit pas y envoyer l'application
 */
function isPrivateHost(host: string): boolean {
  return /^(localhost|\[?::1\]?|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/i.test(host) || host.endsWith('.local');
}

/**
 * Extrait les icônes déclarées par une page, de la plus adaptée à la moins adaptée.
 *
 * @param html Début du HTML de la page
 * @param pageUrl Adresse de la page (base des adresses relatives)
 * @returns Les icônes, sans doublon ; vide si la page n'en déclare aucune
 */
export function parseIconLinks(html: string, pageUrl: string): IconCandidate[] {
  const found = new Map<string, IconCandidate>();
  const page = new URL(pageUrl);

  for (const [tag] of html.slice(0, MAX_HTML_LENGTH).matchAll(/<link\b[^>]*>/gi)) {
    const { rel = '', href, sizes } = attributesOf(tag);
    if (!href || !rel.toLowerCase().split(/\s+/).some((token) => ICON_RELS.includes(token))) continue;

    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    // Une page publique ne peut pas pointer l'application vers le réseau local
    if (!isSafeUrl(url.href) || (isPrivateHost(url.hostname) && !isPrivateHost(page.hostname))) continue;

    if (!found.has(url.href)) found.set(url.href, { url: url.href, size: largestSize(sizes) });
  }

  // Tri stable : à taille égale, l'ordre de la page est conservé
  return [...found.values()].sort((a, b) => score(b) - score(a));
}

/** @returns La préférence d'une icône : la plus grande jusqu'à `PREFERRED_MAX_SIZE` */
const score = ({ size }: IconCandidate): number => Math.min(size || UNKNOWN_SIZE, PREFERRED_MAX_SIZE);

/**
 * @param bytes Début d'un fichier
 * @returns Le type image reconnu à son contenu, `null` si ce n'est pas une image connue
 */
function sniffImageType(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]): boolean => signature.every((value, index) => bytes[index] === value);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57) return 'image/webp';
  if (new TextDecoder().decode(bytes.slice(0, 512)).includes('<svg')) return 'image/svg+xml';

  return null;
}

/**
 * Télécharge une icône et la renvoie en `data:`.
 * @returns L'icône, `null` si l'adresse ne répond pas, n'est pas une image ou est trop lourde
 */
async function download(url: string, fetch: FaviconFetch): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null;

  // Le contenu fait foi : beaucoup de serveurs répondent `text/html` pour une icône absente
  const type = sniffImageType(bytes);
  return type === null ? null : `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * Cherche l'icône d'un site : celles que sa page déclare (la plus grande d'abord), puis `/favicon.ico`
 * et `/apple-touch-icon.png`. Une erreur réseau sur une icône passe à la suivante.
 *
 * @param siteUrl Adresse de l'application
 * @param fetch Requête HTTP
 * @returns L'icône en `data:`, `null` si aucune n'est utilisable
 */
export async function findFavicon(siteUrl: string, fetch: FaviconFetch): Promise<string | null> {
  if (!isSafeUrl(siteUrl)) return null;

  const { origin } = new URL(siteUrl);
  let declared: IconCandidate[] = [];

  try {
    const page = await fetch(siteUrl);
    const type = page.headers.get('content-type') ?? '';
    if (page.ok && type.includes('html')) declared = parseIconLinks(await page.text(), siteUrl);
  } catch {
    // Page illisible : on tente quand même les adresses usuelles
  }

  const urls = [...new Set([...declared.map(({ url }) => url), `${origin}/favicon.ico`, `${origin}/apple-touch-icon.png`])];

  for (const url of urls.slice(0, MAX_ATTEMPTS)) {
    try {
      const icon = await download(url, fetch);
      if (icon) return icon;
    } catch {
      // Icône suivante
    }
  }

  return null;
}
