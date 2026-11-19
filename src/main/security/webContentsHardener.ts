import type { WebContents } from 'electron';
import { isSafeUrl } from '../../scripts/safeUrl.js';

/** Ce que le durcissement lit d'un `WebContents` : de quoi poser des gardes, simple à simuler. */
type HardenableContents = Pick<WebContents, 'setWindowOpenHandler' | 'on'>;

/**
 * Restreint ce qu'un site tiers peut faire : popups, navigation et `<webview>`.
 * Les popups autorisées sont durcies de la même façon.
 * @param isSafe Décide si une adresse peut être ouverte ou suivie
 */
export function hardenWebContents(contents: HardenableContents, isSafe: (url: string) => boolean = isSafeUrl): void {
  // Popups : uniquement http(s) (ex. connexion OAuth), jamais d'autre schéma
  contents.setWindowOpenHandler(({ url }) => {
    if (!isSafe(url)) return { action: 'deny' };

    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
  });

  // Les popups autorisées héritent des mêmes restrictions de navigation
  contents.on('did-create-window', (child) => hardenWebContents(child.webContents, isSafe));

  // Navigation : on bloque file:, javascript:, data:, etc.
  const blockUnsafeNavigation = (event: { preventDefault(): void }, url: string): void => {
    if (!isSafe(url)) event.preventDefault();
  };
  contents.on('will-navigate', blockUnsafeNavigation);
  contents.on('will-redirect', blockUnsafeNavigation);

  // Pas de <webview> dans les sites tiers
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
