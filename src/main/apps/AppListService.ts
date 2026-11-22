/**
 * Service des applications de la barre : ordre, séparateurs, validation et enregistrement.
 *
 * Utilisé par `App` (processus principal) pour répondre aux demandes des pages. Il valide les
 * données reçues, délègue les calculs à `appList` et prévient la page de la barre message par message.
 */
// [sanitizeAppData.ts] Validation et nettoyage des données d'une application reçues d'une page (nom, adresse, icône)
import { sanitizeAppData } from '../security/sanitizeAppData.js';
import type { AppData } from '../security/sanitizeAppData.js';
// [appList.ts] Liste des applications de la barre : ajout, déplacement, suppression, séparateurs
import { indexOfApp, insertSeparatorAfter, moveApp, removeApp, replaceApp, savedUrls } from './appList.js';
import type { AppEntry, MoveDirection, SeparatorRef } from './appList.js';
// [storedApps.ts] Relecture tolérante de la liste des applications enregistrée (`data.rsft`)
import { readStoredApps } from './storedApps.js';

/** Où la liste est enregistrée. */
export interface AppListRepository {
  /** @returns La liste enregistrée, ou `false` s'il n'y en a pas */
  loadAsync(): Promise<unknown>;
  /** Enregistre la liste ; peut lever une erreur si l'écriture échoue. */
  save(data: unknown): void;
  /** Garde une copie du fichier tel qu'il est, avant qu'une version réparée ne le remplace. */
  keepCopy?(): void;
}

/** Ce que la page de la barre doit savoir pour rester à jour, message par message. */
export interface ToolbarMessages {
  /** Une application ou un séparateur a été ajouté en fin de barre. */
  appAdded(entry: AppData | 'separator'): void;
  /** Un séparateur a été inséré au milieu de la barre, après l'application `url`. */
  appInserted(args: { readonly url: string; readonly index: number; readonly data: 'separator' }): void;
  /** Une application a été modifiée ; `oldLink` est son ancienne adresse. */
  appUpdated(args: AppData & { readonly id: number; readonly oldLink: string }): void;
  /** Une application a été retirée de la barre. */
  appDeleted(url: string): void;
  /** Un séparateur est devenu inutile et a été retiré ; `reference` permet à la page de le retrouver. */
  separatorDeleted(reference: SeparatorRef): void;
  /** Une application a été déplacée ; `modifier` est le nombre de séparateurs enjambés. */
  appMoved(args: { readonly url: string; readonly type: MoveDirection; readonly modifier: number }): void;
}

/** Collaborateurs de `AppListService`, injectés pour le garder indépendant d'Electron. */
export interface AppListDeps {
  readonly repository: AppListRepository;
  readonly toolbar: ToolbarMessages;
  /** L'enregistrement a échoué : la liste reste en mémoire, l'utilisateur est prévenu. */
  readonly onSaveError: (error: Error) => void;
}

/** Nombre maximal d'éléments (applications et séparateurs) qu'un ajout peut porter la barre : borne une rafale de demandes. */
const MAX_ENTRIES = 500;

/** Indique si la valeur reçue d'une page est un sens de déplacement valide. */
const isMoveDirection = (value: unknown): value is MoveDirection => value === 'up' || value === 'down';

/** Les applications de la barre : leur ordre, leurs séparateurs et leur enregistrement. */
export class AppListService {
  /** Éléments de la barre ; remplacée à chaque modification plutôt que modifiée sur place. */
  private list: readonly AppEntry[] = [];

  /** @param deps Dépôt d'enregistrement, messages vers la page et gestion d'erreur */
  constructor(private readonly deps: AppListDeps) {}

  /** @returns Les éléments de la barre, dans l'ordre */
  get entries(): readonly AppEntry[] {
    return this.list;
  }

  /** @returns Les adresses des applications déjà dans la barre */
  urls(): string[] {
    return savedUrls(this.list);
  }

  /** @returns La position de l'application dans la barre, -1 si elle est absente */
  indexOf(url: string): number {
    return indexOfApp(this.list, url);
  }

  /**
   * Charge la liste enregistrée de façon tolérante : une entrée inutilisable est écartée, un champ invalide
   * corrigé, une donnée qui n'est pas un tableau donne une barre vide. Avant d'être corrigé en mémoire, le
   * fichier d'origine est copié à part (`keepCopy`) : rien n'est définitivement perdu à la prochaine sauvegarde.
   * @returns `true` si une liste enregistrée a été chargée
   */
  async load(): Promise<boolean> {
    const data = await this.deps.repository.loadAsync();
    if (data === false) return false;

    const { list, repaired } = readStoredApps(data);
    if (repaired) this.keepOriginal();

    this.list = list;
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
    if (this.list.length >= MAX_ENTRIES) return false;

    this.append(clean);
    return true;
  }

  /**
   * Ajoute une application à la fin, avant de l'ouvrir en édition.
   * @returns L'application ajoutée avec sa position, `null` si la donnée est invalide
   */
  addForEdit(raw: unknown): (AppData & { readonly index: number }) | null {
    const clean = sanitizeAppData(raw);
    if (!clean || this.list.length >= MAX_ENTRIES) return null;

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

  /** Ajoute l'application en fin de barre, prévient la page puis enregistre. */
  private append(app: AppData): void {
    this.deps.toolbar.appAdded(app);
    this.list = [...this.list, app];
    this.persist();
  }

  /** Garde une copie du fichier qui va être réparé ; un échec est journalisé sans empêcher le chargement. */
  private keepOriginal(): void {
    try {
      this.deps.repository.keepCopy?.();
    } catch (error) {
      console.error('Copie du fichier des applications impossible', error);
    }
  }

  /** Enregistre la liste ; en cas d'échec elle reste en mémoire et `onSaveError` est appelé. */
  private persist(): void {
    try {
      this.deps.repository.save(this.list);
    } catch (error) {
      console.error('Échec de l’enregistrement de la liste des applications', error);
      this.deps.onSaveError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
