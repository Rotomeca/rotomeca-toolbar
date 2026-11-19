import { sanitizeAppData } from '../security/sanitizeAppData.js';
import type { AppData } from '../security/sanitizeAppData.js';
import { indexOfApp, insertSeparatorAfter, moveApp, removeApp, replaceApp, savedUrls } from './appList.js';
import type { AppEntry, MoveDirection, SeparatorRef } from './appList.js';

/** Où la liste est enregistrée. */
export interface AppListRepository {
  /** @returns La liste enregistrée, ou `false` s'il n'y en a pas */
  loadAsync(): Promise<unknown>;
  save(data: unknown): void;
}

/** Ce que la page de la barre doit savoir pour rester à jour, message par message. */
export interface ToolbarMessages {
  appAdded(entry: AppData | 'separator'): void;
  appInserted(args: { readonly url: string; readonly index: number; readonly data: 'separator' }): void;
  appUpdated(args: AppData & { readonly id: number; readonly oldLink: string }): void;
  appDeleted(url: string): void;
  separatorDeleted(reference: SeparatorRef): void;
  appMoved(args: { readonly url: string; readonly type: MoveDirection; readonly modifier: number }): void;
}

export interface AppListDeps {
  readonly repository: AppListRepository;
  readonly toolbar: ToolbarMessages;
  /** L'enregistrement a échoué : la liste reste en mémoire, l'utilisateur est prévenu. */
  readonly onSaveError: (error: Error) => void;
}

const isMoveDirection = (value: unknown): value is MoveDirection => value === 'up' || value === 'down';

/** Les applications de la barre : leur ordre, leurs séparateurs et leur enregistrement. */
export class AppListService {
  private list: readonly AppEntry[] = [];

  constructor(private readonly deps: AppListDeps) {}

  /** @returns Les éléments de la barre, dans l'ordre */
  get entries(): readonly AppEntry[] {
    return this.list;
  }

  /** @returns Les adresses des applications déjà dans la barre */
  urls(): string[] {
    return savedUrls(this.list);
  }

  indexOf(url: string): number {
    return indexOfApp(this.list, url);
  }

  /** @returns `true` si une liste enregistrée a été chargée */
  async load(): Promise<boolean> {
    const data = await this.deps.repository.loadAsync();
    if (data === false) return false;

    this.list = Array.isArray(data) ? (data as AppEntry[]) : [];
    return true;
  }

  /**
   * Ajoute une application à la fin.
   * @param raw Donnée non fiable reçue d'une page
   * @returns `true` si l'application est dans la barre (ajoutée ou déjà présente)
   */
  add(raw: unknown): boolean {
    const clean = sanitizeAppData(raw);
    if (!clean) return false;
    if (this.indexOf(clean.url) >= 0) return true;

    this.append(clean);
    return true;
  }

  /**
   * Ajoute une application à la fin, avant de l'ouvrir en édition.
   * @returns L'application ajoutée avec sa position, `null` si la donnée est invalide
   */
  addForEdit(raw: unknown): (AppData & { readonly index: number }) | null {
    const clean = sanitizeAppData(raw);
    if (!clean) return null;

    this.append(clean);
    return { ...clean, index: this.list.length - 1 };
  }

  /** Insère un séparateur après l'application ; ne fait rien si elle est absente. */
  addSeparatorAfter(url: unknown): void {
    if (typeof url !== 'string') return;

    const insertion = insertSeparatorAfter(this.list, url);
    if (!insertion) return;

    if (insertion.kind === 'appended') this.deps.toolbar.appAdded('separator');
    else this.deps.toolbar.appInserted({ url, index: insertion.index, data: 'separator' });

    this.list = insertion.list;
    this.persist();
  }

  /**
   * Modifie une application (nom, adresse, image).
   * @param raw Donnée non fiable : l'application modifiée est désignée par sa position (`id`)
   * @returns `true` si l'application a été modifiée
   */
  update(raw: unknown): boolean {
    const clean = sanitizeAppData(raw);
    const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : undefined;
    const replaced = clean ? replaceApp(this.list, id, clean) : null;
    if (!clean || !replaced) return false;

    this.list = replaced.list;
    this.deps.toolbar.appUpdated({ ...clean, id: id as number, oldLink: replaced.oldLink });
    this.persist();
    return true;
  }

  /** Retire l'application, puis les séparateurs devenus consécutifs. */
  remove(url: string): void {
    this.deps.toolbar.appDeleted(url);

    const { list, removedSeparators } = removeApp(this.list, url);
    for (const reference of removedSeparators) this.deps.toolbar.separatorDeleted(reference);

    this.list = list;
    this.persist();
  }

  /**
   * Déplace une application d'un cran.
   * @param raw Donnée non fiable : `{ url, type: 'up' | 'down' }`
   * @returns `true` si l'application a été déplacée
   */
  move(raw: unknown): boolean {
    const { url, type } = (typeof raw === 'object' && raw !== null ? raw : {}) as { url?: unknown; type?: unknown };
    if (typeof url !== 'string' || !isMoveDirection(type)) return false;

    const moved = moveApp(this.list, url, type);
    if (!moved) return false;

    this.deps.toolbar.appMoved({ url, type, modifier: moved.modifier });
    for (const reference of moved.removedSeparators) this.deps.toolbar.separatorDeleted(reference);

    this.list = moved.list;
    this.persist();
    return true;
  }

  private append(app: AppData): void {
    this.deps.toolbar.appAdded(app);
    this.list = [...this.list, app];
    this.persist();
  }

  private persist(): void {
    try {
      this.deps.repository.save(this.list);
    } catch (error) {
      console.error('Failed to save the file', error);
      this.deps.onSaveError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
