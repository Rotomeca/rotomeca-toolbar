import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { appEventList } from '../../shared/ipc/events.js';
import { isTrustedSender } from '../ipc/trustedSender.js';
import { buildWindowConfig } from '../windows/windowConfig.js';
import type { ContextMenuEvent, ContextMenuItem } from './contextMenuModel.js';

/** Ce que le menu contextuel demande à l'application. */
export interface ContextMenuHooks {
  /** @param windowId Fenêtre dans laquelle le clic a eu lieu */
  shouldShow(event: ContextMenuEvent, windowId: number): boolean;
  menu(event: ContextMenuEvent): ContextMenuItem[];
}

const PAGE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'WebContentElecrtonContextMenu.js');
const MENU_PAGE = path.join(__dirname, '..', '..', 'page.contextmenu', 'context.html');
const MENU_PRELOAD = path.join(__dirname, '..', '..', '..', 'preload.js');

const CHAR_WIDTH = 12;
const ITEM_HEIGHT = 30;
const MENU_PADDING = 4;

/** Injecte dans la page le script qui transmet le clic droit au processus principal. */
function injectPageScript(window: BrowserWindow): void {
  window.webContents.on('dom-ready', () => {
    window.webContents.executeJavaScript(fs.readFileSync(PAGE_SCRIPT).toString()).catch(console.error);
  });
}

function openMenu(parent: BrowserWindow, event: ContextMenuEvent, items: readonly ContextMenuItem[]): void {
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

  menuWindow.webContents.loadFile(MENU_PAGE).catch(console.error);
  menuWindow.webContents
    .executeJavaScript(`window.electron ??= {}; window.electron.menu = ${JSON.stringify(items)}`)
    .catch(console.error);
  menuWindow.on('blur', () => menuWindow.destroy());
}

let started = false;

/**
 * Active le menu contextuel sur les fenêtres de l'application (une seule fois).
 * Le menu s'ouvre quand `shouldShow` l'accepte et que `menu` donne au moins un bouton.
 */
export function startContextMenu(hooks: ContextMenuHooks): void {
  if (started) return;
  started = true;

  for (const window of BrowserWindow.getAllWindows()) injectPageScript(window);

  app.on('browser-window-created', (_, window) => {
    // Les fenêtres de menu ont un parent : elles n'ont pas de menu contextuel
    if (!window.getParentWindow()) injectPageScript(window);
  });

  ipcMain.handle(appEventList.rotomecaContextMenu, (ipcEvent: IpcMainInvokeEvent, event: ContextMenuEvent) => {
    if (!isTrustedSender(ipcEvent)) return;

    const window = BrowserWindow.fromWebContents(ipcEvent.sender);
    if (!window || !window.isVisible() || !hooks.shouldShow(event, window.id)) return;

    const items = hooks.menu(event);
    if (items.length > 0) openMenu(window, event, items);
  });
}
