/**
 * Requête réseau des icônes : adaptateur d'Electron (`net.request`) qui contrôle chaque redirection.
 *
 * Utilisé par `App` pour alimenter `FaviconService`. `net.fetch` suit les redirections sans rien demander :
 * un site pourrait rediriger vers le réseau local. Ici chaque redirection passe par `isAllowedFaviconRedirect`
 * avant d'être suivie. Sans cookies ni identifiants (comportement par défaut de `net.request`).
 */
// [node:stream] flux (Node.js)
import { Readable } from 'node:stream';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { net } from 'electron';
// [favicon.ts] Recherche de l'icône d'un site : lecture de sa page, classement des icônes déclarées, téléchargement
import { isAllowedFaviconRedirect } from './favicon.js';
import type { FaviconFetch } from './favicon.js';

/** Nombre maximal de redirections suivies pour une adresse. */
const MAX_REDIRECTS = 5;
/** Codes de réponse qui n'ont jamais de corps (un `Response` avec corps est alors refusé). */
const NO_BODY_STATUSES = [204, 205, 304];

/** Réglages de la requête. */
export interface FaviconFetchOptions {
  /** Identifiant de navigateur à présenter (certains serveurs refusent « Electron/x.y.z »). */
  readonly userAgent: () => string;
  /** Délai maximal de toute la requête, corps compris (ms). */
  readonly timeoutMs: number;
}

/**
 * @param options Identifiant de navigateur et délai maximal
 * @returns Une requête GET qui ne suit que les redirections autorisées ; la réponse est un `Response` standard
 */
export function createFaviconFetch({ userAgent, timeoutMs }: FaviconFetchOptions): FaviconFetch {
  return (url) =>
    new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'GET', redirect: 'manual' });
      request.setHeader('user-agent', userAgent());

      let current = url;
      let redirects = 0;
      const timer = setTimeout(() => request.abort(), timeoutMs);

      request.on('redirect', (_status, _method, redirectUrl) => {
        if (++redirects > MAX_REDIRECTS || !isAllowedFaviconRedirect(current, redirectUrl)) {
          clearTimeout(timer);
          request.abort();
          reject(new Error(`Redirection refusée : ${current}`));
          return;
        }

        current = redirectUrl;
        request.followRedirect();
      });

      request.on('response', (incoming) => {
        incoming.on('end', () => clearTimeout(timer));
        incoming.on('error', () => clearTimeout(timer));

        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) headers.set(name, Array.isArray(value) ? value.join(', ') : value);

        const status = incoming.statusCode;
        // `IncomingMessage` d'Electron est un `Readable` Node à l'exécution, mais ses types ne le déclarent pas
        const body = NO_BODY_STATUSES.includes(status) ? null : (Readable.toWeb(incoming as unknown as Readable) as ReadableStream<Uint8Array>);
        resolve(new Response(body, { status, headers }));
      });

      request.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      request.on('abort', () => {
        clearTimeout(timer);
        reject(new Error(`Requête interrompue : ${current}`));
      });

      request.end();
    });
}
