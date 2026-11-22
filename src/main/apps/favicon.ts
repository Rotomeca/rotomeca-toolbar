/**
 * Recherche de l'icône d'un site : lecture de sa page, classement des icônes déclarées, téléchargement.
 *
 * Utilisé par `FaviconService`. Pur, sans `electron` : le réseau est injecté (testable). Un service d'icônes
 * répond en un seul appel à partir du nom d'hôte ; à défaut, on lit la page du site. Le mode `fast` essaie d'abord
 * `/favicon.ico` (comme avant la recherche dans la page), puis le service. Chaque icône
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
  /** Corps en flux : permet de ne lire que le début d'une page volumineuse. */
  readonly body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<unknown> } } | null;
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

/** Service d'icônes interrogé en premier : répond à partir du seul nom d'hôte (404 si le site est inconnu). */
const quickLookupUrl = (host: string): string => `https://icons.duckduckgo.com/ip3/${host}.ico`;

/** Taille maximale d'une page HTML lue (l'en-tête suffit). */
const MAX_HTML_LENGTH = 256 * 1024;
/** Taille maximale d'une icône conservée. */
const MAX_ICON_BYTES = 128 * 1024;
/** Nombre maximal d'icônes essayées pour un site. */
const MAX_ATTEMPTS = 8;
/** Taille au-delà de laquelle une icône plus grande n'est plus préférée (le bouton est petit). */
const PREFERRED_MAX_SIZE = 192;
/** Taille supposée d'une icône dont la page ne donne pas les dimensions. */
const UNKNOWN_SIZE = 32;
/** Taille supposée d'une icône vectorielle (`sizes="any"`). */
const VECTOR_SIZE = 512;

/** Relations `rel` qui désignent une icône de site. */
const ICON_RELS = ['icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed'];

/**
 * Lit le début d'une page : jusqu'à la fin de son `<head>` ou `MAX_HTML_LENGTH` caractères. Une page
 * volumineuse (plusieurs Mo) n'est donc jamais téléchargée en entier.
 *
 * @param response Réponse de la page
 * @returns Le début du HTML
 */
async function readHead(response: FaviconResponse): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, MAX_HTML_LENGTH);

  const decoder = new TextDecoder();
  let html = '';

  try {
    while (html.length < MAX_HTML_LENGTH && !/<\/head\s*>/i.test(html)) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return html.slice(0, MAX_HTML_LENGTH);
}

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
 * @param host Nom d'hôte d'une adresse (déjà normalisé par `URL` : adresses décimales ou hexadécimales converties)
 * @returns `true` pour un nom local ou une adresse IP privée, de boucle locale, de lien local ou partagée
 * (10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, IPv6 `::1`, `fc00::/7`, `fe80::/10`, IPv4 mappées) :
 * une page publique ne doit pas y envoyer l'application
 */
function isPrivateHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (name === 'localhost' || ['.localhost', '.local', '.internal'].some((suffix) => name.endsWith(suffix))) return true;
  if (name.includes(':')) return /^(::1?$|fe[89ab]|f[cd]|::ffff:)/.test(name);

  const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(name);
  if (!octets) return false;

  const [first, second] = [Number(octets[1]), Number(octets[2])];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/**
 * Décide si une redirection peut être suivie : une adresse http(s), et jamais vers le réseau local depuis
 * un site public (sinon un site pourrait faire émettre des requêtes vers l'intranet de l'utilisateur).
 *
 * @param from Adresse qui redirige
 * @param to Adresse vers laquelle elle redirige
 * @returns `true` si la redirection peut être suivie
 */
export function isAllowedFaviconRedirect(from: string, to: string): boolean {
  try {
    return isSafeUrl(to) && !(isPrivateHost(new URL(to).hostname) && !isPrivateHost(new URL(from).hostname));
  } catch {
    return false;
  }
}

/**
 * @param host Nom d'hôte d'une application
 * @returns `true` si le nom peut être transmis à un service d'icônes : un nom de domaine public, ni adresse IP, ni nom local
 */
function isShareableHost(host: string): boolean {
  return host.includes('.') && !isPrivateHost(host) && !/^[\d.]+$|:/.test(host);
}

/**
 * @param a Nom d'hôte
 * @param b Nom d'hôte
 * @returns `true` si les deux hôtes partagent leur domaine (les deux derniers libellés, sans tenir compte des suffixes composés)
 */
function isSameSite(a: string, b: string): boolean {
  const domain = (host: string): string => host.split('.').slice(-2).join('.');
  return domain(a) === domain(b);
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
 * Lit le corps d'une icône sans jamais dépasser `MAX_ICON_BYTES` en mémoire : la lecture s'arrête (et la
 * connexion est coupée) dès que la taille est dépassée, qu'elle soit annoncée ou non.
 *
 * @param response Réponse de l'icône
 * @returns Les octets, `null` si l'icône est trop lourde
 */
async function readIcon(response: FaviconResponse): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_ICON_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > MAX_ICON_BYTES ? null : bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.length;
      if (total > MAX_ICON_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks);
}

/**
 * Télécharge une icône et la renvoie en `data:`.
 * @returns L'icône, `null` si l'adresse ne répond pas, n'est pas une image ou est trop lourde
 */
async function download(url: string, fetch: FaviconFetch): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;

  const bytes = await readIcon(response);
  if (bytes === null || bytes.length === 0) return null;

  // Le contenu fait foi : beaucoup de serveurs répondent `text/html` pour une icône absente
  const type = sniffImageType(bytes);
  return type === null ? null : `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Le site n'a pas pu être interrogé (réseau coupé, délai dépassé) : l'absence d'icône n'est pas établie. */
export class FaviconNetworkError extends Error {}

/**
 * Cherche l'icône d'un site : celles que sa page déclare (la plus grande d'abord), puis `/favicon.ico`
 * et `/apple-touch-icon.png`. Une erreur réseau sur une icône passe à la suivante.
 *
 * @param siteUrl Adresse de l'application
 * @param fetch Requête HTTP
 * @param options `fast` : essaie d'abord `/favicon.ico` du site, puis un service d'icônes qui ne reçoit que le nom d'hôte (jamais un nom privé ou local), avant de lire la page
 * @returns L'icône en `data:`, `null` si le site n'en a pas
 * @throws {FaviconNetworkError} Si aucune icône n'a été trouvée et que le site n'a répondu à aucune requête
 */
export async function findFavicon(
  siteUrl: string,
  fetch: FaviconFetch,
  { fast = false }: { readonly fast?: boolean } = {},
): Promise<string | null> {
  if (!isSafeUrl(siteUrl)) return null;

  const { origin, hostname } = new URL(siteUrl);
  let declared: IconCandidate[] = [];
  let answered = false;

  // Adresses déjà essayées : la lecture de la page ne les refait pas
  const tried = new Set<string>();
  /** Essaie une adresse ; `null` si elle n'est pas une icône utilisable ou ne répond pas. */
  const attempt = async (url: string): Promise<string | null> => {
    tried.add(url);
    try {
      const icon = await download(url, fetch);
      answered = true;
      return icon;
    } catch {
      return null;
    }
  };

  if (fast) {
    // 1. L'adresse usuelle du site : une seule requête, rien n'est transmis à un tiers
    const own = await attempt(`${origin}/favicon.ico`);
    if (own) return own;

    // 2. Un service d'icônes, qui ne reçoit que le nom d'hôte (jamais un nom privé ou local)
    const service = isShareableHost(hostname) ? await attempt(quickLookupUrl(hostname)) : null;
    if (service) return service;
  }

  try {
    const page = await fetch(siteUrl);
    answered = true;
    const type = page.headers.get('content-type') ?? '';
    if (page.ok && type.includes('html')) declared = parseIconLinks(await readHead(page), siteUrl);
  } catch {
    // Page illisible : on tente quand même les adresses usuelles
  }

  // Les icônes du site lui-même d'abord, puis les adresses usuelles, enfin celles d'un autre site (une page
  // d'avertissement ou de consentement déclare souvent l'icône de son hébergeur, pas celle du site)
  const own = declared.filter(({ url }) => isSameSite(new URL(url).hostname, new URL(siteUrl).hostname));
  const others = declared.filter((icon) => !own.includes(icon));
  const urls = [
    ...new Set([
      ...own.map(({ url }) => url),
      `${origin}/favicon.ico`,
      `${origin}/apple-touch-icon.png`,
      ...others.map(({ url }) => url),
    ]),
  ].filter((url) => !tried.has(url));

  for (const url of urls.slice(0, MAX_ATTEMPTS)) {
    const icon = await attempt(url);
    if (icon) return icon;
  }

  if (!answered) throw new FaviconNetworkError(`Aucune réponse de ${origin}`);
  return null;
}
