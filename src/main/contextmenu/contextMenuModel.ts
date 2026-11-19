/** Ce que la page envoie sur l'élément cliqué avec le bouton droit. */
export interface ContextMenuTarget {
  readonly nodeName: string;
  readonly attribs: Readonly<Record<string, string>>;
  readonly classes: readonly string[];
}

export interface ContextMenuEvent {
  readonly target: ContextMenuTarget;
  readonly button: number;
  readonly x: number;
  readonly y: number;
}

export type ContextMenuAction = 'delete' | 'addseparator' | 'goUp' | 'goDown' | 'toggleMute' | 'edit';

export interface ContextMenuItem {
  readonly text: string;
  readonly title: string;
  readonly action: ContextMenuAction;
  readonly data: Readonly<Record<string, string | null | undefined>>;
  readonly disabled?: boolean;
}

/** Un élément enregistré de la barre : une application (avec son adresse) ou un séparateur. */
export type SavedEntry = 'separator' | { readonly url: string; readonly picture?: string | null };

export type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

export interface MenuContext {
  readonly saves: readonly SavedEntry[];
  readonly isMuted: (url: string) => boolean;
  readonly translate: Translate;
}

const isSeparator = (entry: SavedEntry | undefined): boolean => entry === 'separator';

function pictureOf(saves: readonly SavedEntry[], url: string): string | null | undefined {
  for (const entry of saves) if (typeof entry === 'object' && entry.url === url) return entry.picture;
  return undefined;
}

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
