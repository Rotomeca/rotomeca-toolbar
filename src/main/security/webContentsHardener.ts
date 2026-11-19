/**
 * Durcit le contenu web d'un site tiers : popups, navigation et `<webview>` restreints.
 *
 * Appliqué par `App.ts` à chaque vue de site lancé. Seules les adresses jugées sûres (http et https)
 * sont suivies ; tout le reste (`file:`, `javascript:`, `data:`) est bloqué.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { WebContents } from 'electron';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../../scripts/safeUrl.js';

/** Ce que le durcissement lit d'un `WebContents` : de quoi poser des gardes, simple à simuler. */
type HardenableContents = Pick<WebContents, 'setWindowOpenHandler' | 'on'>;

/**
 * Restreint ce qu'un site tiers peut faire : popups, navigation et `<webview>`.
 * Les popups autorisées sont durcies de la même façon.
 * @param contents Contenu web à restreindre.
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
