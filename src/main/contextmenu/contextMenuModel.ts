/**
 * Contenu du menu contextuel des boutons de la barre (mode normal et mode édition).
 *
 * Logique pure, sans Electron : `ContextMenuController` l'appelle avec les boutons enregistrés.
 * Les actions produites sont celles que la page du menu renvoie au processus principal.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { ContextMenuAction, ContextMenuItem } from '../../shared/dto.js';

/** Ce que la page envoie sur l'élément cliqué avec le bouton droit. */
export interface ContextMenuTarget {
  readonly nodeName: string;
  readonly attribs: Readonly<Record<string, string>>;
  readonly classes: readonly string[];
}

/** Clic droit reçu de la page : élément visé, bouton de souris et position dans la fenêtre. */
export interface ContextMenuEvent {
  readonly target: ContextMenuTarget;
  readonly button: number;
  readonly x: number;
  readonly y: number;
}

export type { ContextMenuAction, ContextMenuItem };

/** @returns true si la valeur est un objet non nul (donc lisible par clé) */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** @returns true si la valeur est un nombre fini (ni NaN ni infini) */
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Valide un clic droit reçu d'une page : seule la forme attendue est conservée, rien d'autre ne passe.
 * @param raw Donnée non fiable reçue par l'IPC
 * @returns Le clic droit validé, ou `null` si la forme ou les nombres sont invalides
 */
export function parseContextMenuEvent(raw: unknown): ContextMenuEvent | null {
  if (!isRecord(raw) || !isRecord(raw['target'])) return null;

  const { nodeName, attribs, classes } = raw['target'];
  const { button, x, y } = raw;
  if (typeof nodeName !== 'string' || !isRecord(attribs) || !Array.isArray(classes)) return null;
  if (!isFiniteNumber(button) || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;

  return {
    target: {
      nodeName,
      attribs: Object.fromEntries(Object.entries(attribs).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      classes: classes.filter((name): name is string => typeof name === 'string'),
    },
    button,
    x,
    y,
  };
}

/** Un élément enregistré de la barre : une application (avec son adresse) ou un séparateur. */
export type SavedEntry = 'separator' | { readonly url: string; readonly picture?: string | null };

/** Fonction de traduction : clé de `fr.json` / `en.json` et variables à insérer dans le texte. */
export type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

/** Ce dont la construction du menu a besoin : boutons connus, état du son et traduction. */
export interface MenuContext {
  readonly saves: readonly SavedEntry[];
  readonly isMuted: (url: string) => boolean;
  readonly translate: Translate;
}

/** Une entrée du menu de la fenêtre des applications : libellé et action au clic. */
export interface AppsWindowMenuEntry {
  readonly label: string;
  readonly click: () => void;
}

/**
 * @param translate Traduction des textes du menu
 * @param actions Actions que le menu déclenche
 * @returns Les entrées du menu (clic droit sur l'en-tête de la fenêtre des applications)
 */
export function buildAppsWindowMenu(
  translate: Translate,
  actions: { readonly resetSize: () => void },
): AppsWindowMenuEntry[] {
  return [{ label: translate('apps.resetSize'), click: actions.resetSize }];
}

/** Indique si l'élément enregistré est un séparateur. */
const isSeparator = (entry: SavedEntry | undefined): boolean => entry === 'separator';

/** @returns L'image enregistrée de l'application, `undefined` si elle est inconnue */
function pictureOf(saves: readonly SavedEntry[], url: string): string | null | undefined {
  for (const entry of saves) if (typeof entry === 'object' && entry.url === url) return entry.picture;
  return undefined;
}

/** @returns L'adresse de l'application, `undefined` pour un séparateur ou une entrée absente */
function urlOf(entry: SavedEntry | undefined): string | undefined {
  return typeof entry === 'object' ? entry.url : undefined;
}

/**
 * @returns Les boutons du menu pour l'élément cliqué : en mode édition (déplacer, séparateur,
 * supprimer), sinon (supprimer, couper le son, modifier). Vide si l'application est inconnue.
 */
export function buildContextMenu(event: ContextMenuEvent, { saves, isMuted, translate: t }: MenuContext): ContextMenuItem[] {
  const url = event.target.attribs.href ?? '';
  const name = event.target.attribs.title ?? '';
  const data = { url };
  const remove: ContextMenuItem = {
    text: t('contextMenu.delete'),
    title: t('contextMenu.deleteTitle', { name }),
    action: 'delete',
    data,
  };

  if (event.target.classes.includes('edit')) return buildEditMenu(remove, url, saves, t);

  return [
    remove,
    {
      text: isMuted(url) ? t('contextMenu.unmute') : t('contextMenu.mute'),
      title: t('contextMenu.muteTitle'),
      action: 'toggleMute',
      data,
    },
    {
      text: t('contextMenu.edit'),
      title: t('contextMenu.editTitle', { name }),
      action: 'edit',
      data: { url, title: name, picture: pictureOf(saves, url) },
    },
  ];
}

/**
 * Menu du mode édition. Les actions de déplacement et de séparateur sont désactivées quand elles
 * n'auraient aucun effet (déjà en bout de liste, séparateur déjà présent).
 * @returns Les boutons, vide si l'application n'est pas dans la liste
 */
function buildEditMenu(remove: ContextMenuItem, url: string, saves: readonly SavedEntry[], t: Translate): ContextMenuItem[] {
  const index = saves.findIndex((entry) => urlOf(entry) === url);
  if (index < 0) return [];

  const data = { url };
  const last = saves.length - 1;

  return [
    remove,
    {
      text: t('contextMenu.addSeparator'),
      title: t('contextMenu.addSeparatorTitle'),
      action: 'addseparator',
      data,
      disabled: index + 1 < saves.length && isSeparator(saves[index + 1]),
    },
    {
      text: t('contextMenu.moveUp'),
      title: t('contextMenu.moveUpTitle'),
      action: 'goUp',
      data,
      disabled: saves.filter((entry) => !isSeparator(entry)).length === 1 || index - 1 < 0,
    },
    {
      text: t('contextMenu.moveDown'),
      title: t('contextMenu.moveDownTitle'),
      action: 'goDown',
      data,
      disabled: index + 1 >= saves.length || (index + 1 === last && isSeparator(saves[last])),
    },
  ];
}
