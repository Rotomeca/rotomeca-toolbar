/**
 * Menu contextuel Electron : injecte le script de clic droit et ouvre la fenêtre du menu.
 *
 * Utilisé par `App` ; ne contient aucune règle métier, il interroge `ContextMenuHooks` pour savoir
 * s'il s'ouvre et avec quels boutons. Il n'accepte l'IPC que d'un expéditeur de confiance.
 */
// [node:fs] accès au système de fichiers (Node.js)
import fs from 'node:fs';
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { BrowserWindow, Menu, app, ipcMain, shell } from 'electron';
import type { BaseWindow, IpcMainInvokeEvent } from 'electron';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList } from '../../shared/ipc/events.js';
// [trustedSender.ts] Contrôle de l'origine d'un appel IPC : seule la page principale d'une fenêtre locale est de confiance
import { isTrustedSender } from '../ipc/trustedSender.js';
// [localPageGuard.ts] Garde des pages locales de l'application : seules les pages du paquet sont de confiance
import { isLocalPageUrl, lockLocalContents } from '../security/localPageGuard.js';
// [windowConfig.ts] Construction des options d'une `BrowserWindow` à partir d'une description sans réglages de sécurité
import { buildWindowConfig } from '../windows/windowConfig.js';
// [contextMenuModel.ts] Contenu du menu contextuel des boutons de la barre (mode normal et mode édition)
import type { AppsWindowMenuEntry, ContextMenuEvent, ContextMenuItem } from './contextMenuModel.js';

/** Ce que le menu contextuel demande à l'application. */
export interface ContextMenuHooks {
  /** @param windowId Fenêtre dans laquelle le clic a eu lieu */
  shouldShow(event: ContextMenuEvent, windowId: number): boolean;
  /** @returns Les boutons à afficher ; vide pour ne pas ouvrir de menu */
  menu(event: ContextMenuEvent): ContextMenuItem[];
}

/** Script injecté dans les pages pour remonter le clic droit au processus principal. */
const PAGE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'WebContentElecrtonContextMenu.js');
/** Page HTML affichée dans la fenêtre du menu. */
const MENU_PAGE = path.join(__dirname, '..', '..', 'page.contextmenu', 'context.html');
/** Preload commun, qui expose à la page du menu la liste blanche des canaux IPC. */
const MENU_PRELOAD = path.join(__dirname, '..', '..', '..', 'preload.js');

/** Largeur estimée d'un caractère, en pixels : la fenêtre est dimensionnée sur le texte le plus long. */
const CHAR_WIDTH = 12;
/** Hauteur d'un bouton du menu, en pixels. */
const ITEM_HEIGHT = 30;
/** Marge verticale totale autour des boutons, en pixels. */
const MENU_PADDING = 4;

/**
 * Injecte dans la page le script qui transmet le clic droit au processus principal.
 * Une fenêtre qui affiche autre chose qu'une page de l'application (popup d'un site) n'en reçoit pas :
 * le script n'a rien à y faire et ne doit pas s'exécuter dans une page tierce.
 */
function injectPageScript(window: BrowserWindow, appRoot: string): void {
  window.webContents.on('dom-ready', () => {
    if (!isLocalPageUrl(window.webContents.getURL(), appRoot)) return;

    window.webContents.executeJavaScript(fs.readFileSync(PAGE_SCRIPT).toString()).catch(console.error);
  });
}

/**
 * Ouvre la fenêtre du menu à l'endroit du clic, au-dessus de sa fenêtre parente ; elle se détruit
 * dès qu'elle perd le focus. Les boutons sont transmis à la page par une variable globale.
 */
function openMenu(parent: BrowserWindow, event: ContextMenuEvent, items: readonly ContextMenuItem[], appRoot: string): void {
  const bounds = parent.getBounds();
  const longest = Math.max(...items.map((item) => item.text.length));

  const menuWindow = new BrowserWindow(
    buildWindowConfig('contextmenu', {
      show: true,
      x: bounds.x + event.x,
      y: bounds.y + event.y,
      width: CHAR_WIDTH * longest,
      height: items.length * ITEM_HEIGHT + MENU_PADDING,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      useContentSize: true,
      skipTaskbar: false,
      resizable: false,
      preload: MENU_PRELOAD,
      extra: { parent },
    }),
  );

  lockLocalContents(menuWindow.webContents, { appRoot, openExternal: (url) => void shell.openExternal(url) });
  menuWindow.webContents.loadFile(MENU_PAGE).catch(console.error);
  menuWindow.webContents
    .executeJavaScript(`window.electron ??= {}; window.electron.menu = ${JSON.stringify(items)}`)
    .catch(console.error);
  menuWindow.on('blur', () => menuWindow.destroy());
}

/**
 * Affiche un menu natif à la position de la souris, au-dessus d'une fenêtre.
 * @param window Fenêtre qui porte le menu
 * @param entries Entrées du menu
 */
export function showAppsWindowMenu(window: BaseWindow, entries: readonly AppsWindowMenuEntry[]): void {
  Menu.buildFromTemplate(entries.map(({ label, click }) => ({ label, click: () => click() }))).popup({ window });
}

/** Garde-fou : le canal IPC ne peut être enregistré qu'une fois. */
let started = false;

/**
 * Active le menu contextuel sur les fenêtres de l'application (une seule fois).
 * Le menu s'ouvre quand `shouldShow` l'accepte et que `menu` donne au moins un bouton.
 * @param hooks Ce que le menu demande à l'application
 * @param appRoot Racine de l'application construite : seules ses pages portent le menu et peuvent l'ouvrir
 */
export function startContextMenu(hooks: ContextMenuHooks, appRoot: string): void {
  if (started) return;
  started = true;

  for (const window of BrowserWindow.getAllWindows()) injectPageScript(window, appRoot);

  app.on('browser-window-created', (_, window) => {
    // Les fenêtres de menu ont un parent : elles n'ont pas de menu contextuel
    if (!window.getParentWindow()) injectPageScript(window, appRoot);
  });

  ipcMain.handle(appEventList.rotomecaContextMenu, (ipcEvent: IpcMainInvokeEvent, event: ContextMenuEvent) => {
    if (!isTrustedSender(ipcEvent, appRoot)) return;

    const window = BrowserWindow.fromWebContents(ipcEvent.sender);
    if (!window || !window.isVisible() || !hooks.shouldShow(event, window.id)) return;

    const items = hooks.menu(event);
    if (items.length > 0) openMenu(window, event, items, appRoot);
  });
}
