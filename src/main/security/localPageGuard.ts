/**
 * Garde des pages locales de l'application : seules les pages du paquet sont de confiance, et elles ne naviguent ni n'ouvrent de fenêtre.
 *
 * Utilisé par `AppWindows` et le menu contextuel pour verrouiller chaque fenêtre qui porte le preload,
 * et par `trustedSender` pour reconnaître une page locale. Une page locale qui suivrait un lien ou une
 * popup deviendrait un site distant doté du preload : on l'empêche ici.
 */
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [node:url] conversion entre URL `file:` et chemins de fichiers (Node.js)
import { fileURLToPath } from 'node:url';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { WebContents } from 'electron';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { toSafeHref } from '../../scripts/safeUrl.js';

/** Ce que le verrou lit d'un `WebContents` : de quoi poser des gardes, simple à simuler. */
type LockableContents = Pick<WebContents, 'setWindowOpenHandler' | 'on'>;

/** Réglages du verrou d'une page locale. */
export interface LocalPageLock {
  /** Racine de l'application construite : seules les pages qu'elle contient sont locales. */
  readonly appRoot: string;
  /** Ouvre une adresse http(s) dans le navigateur du système (jamais dans l'application). */
  readonly openExternal: (url: string) => void;
}

/**
 * Une URL est une page locale si c'est un fichier `file:` situé dans la racine de l'application.
 * Un autre fichier du disque, un partage réseau (`file://serveur/…`) ou un chemin qui remonte (`..`) ne le sont pas.
 *
 * @param url Adresse à contrôler (rien n'est supposé : elle peut venir d'une page)
 * @param appRoot Racine de l'application construite
 * @returns true si l'adresse désigne un fichier de l'application
 */
export function isLocalPageUrl(url: string, appRoot: string): boolean {
  try {
    const pageUrl = new URL(url);
    if (pageUrl.protocol !== 'file:' || pageUrl.hostname !== '') return false;

    const relative = path.relative(appRoot, fileURLToPath(pageUrl));
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

/**
 * Verrouille une page locale : aucune popup (une adresse http(s) est confiée au navigateur du système),
 * aucune navigation de la page principale hors de l'application, aucun `<webview>`.
 * Les sous-cadres ne sont pas concernés (l'iframe de recherche navigue dans son propre site).
 *
 * @param contents Contenu web de la page locale
 * @param lock Racine de l'application et ouverture externe
 */
export function lockLocalContents(contents: LockableContents, { appRoot, openExternal }: LocalPageLock): void {
  contents.setWindowOpenHandler(({ url }) => {
    const href = toSafeHref(url);
    if (href) openExternal(href);

    return { action: 'deny' };
  });

  const blockForeignNavigation = (event: { preventDefault(): void }, url: string): void => {
    if (!isLocalPageUrl(url, appRoot)) event.preventDefault();
  };
  contents.on('will-navigate', blockForeignNavigation);
  contents.on('will-redirect', blockForeignNavigation);

  contents.on('will-attach-webview', (event) => event.preventDefault());
}
