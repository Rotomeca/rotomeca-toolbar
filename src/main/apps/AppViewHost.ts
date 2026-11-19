import { MEDIA_ACTIONS, parseUnreadCount } from '../../scripts/AppIndicators.js';
import type { MediaAction, MediaState } from '../../scripts/AppIndicators.js';
import type { Rect } from '../dock/dockGeometry.js';

/** Ce que l'hôte demande à la page d'un site (un sous-ensemble de `WebContents`). */
export interface AppWebContents {
  readonly id: number;
  isDestroyed(): boolean;
  stop(): void;
  close(): void;
  destroy?(): void;
  reload(): void;
  setAudioMuted(muted: boolean): void;
  send(channel: string, ...args: unknown[]): void;
  loadURL(url: string): Promise<void>;
  on(event: 'page-title-updated', listener: (event: unknown, title: string) => void): unknown;
  on(event: 'audio-state-changed', listener: (event: { audible: boolean }) => void): unknown;
}

/** Une vue qui affiche un site (un sous-ensemble de `WebContentsView`). */
export interface AppView {
  setVisible(visible: boolean): void;
  setBounds(bounds: Rect): void;
  readonly webContents: AppWebContents;
}

/** La fenêtre qui porte les vues des sites. */
export interface ViewSurface {
  getBounds(): Rect;
  show(): void;
  hide(): void;
  addChildView(view: AppView): void;
  removeChildView(view: AppView): void;
  /** Indique à l'en-tête de la fenêtre quel site vient d'être ouvert. */
  announceOpened(url: string): void;
}

/** Ce qu'une application ouverte expose : sa vue et ce que son site indique (non-lus, son, morceau). */
export interface ViewEntry {
  readonly view: AppView;
  visible: boolean;
  badge: number;
  audible: boolean;
  media: MediaState | undefined;
}

export interface IndicatorChanges {
  readonly badge?: number;
  readonly audible?: boolean;
  readonly media?: MediaState | null;
}

export interface AppViewHostDeps {
  readonly surface: ViewSurface;
  /** Crée une vue durcie (preload, sandbox, restrictions de navigation) pour un site. */
  readonly createView: () => AppView;
  readonly isSafeUrl: (url: unknown) => url is string;
  /** Hauteur de l'en-tête de la fenêtre, au-dessus des vues. */
  readonly headerHeight: number;
  /** Les indicateurs d'une application ont changé (titre, son, morceau, muet, vue fermée). */
  readonly onChange: (url: string) => void;
  /** Canal interne par lequel on commande le lecteur d'un site. */
  readonly mediaActionChannel: string;
}

const isMediaAction = (action: unknown): action is MediaAction => (MEDIA_ACTIONS as readonly unknown[]).includes(action);

/**
 * Les sites ouverts en arrière-plan : leurs vues, leur état (non-lus, son, morceau) et le
 * réglage « son coupé », qui survit à la fermeture de la vue tant que l'application tourne.
 */
export class AppViewHost {
  private readonly entries = new Map<string, ViewEntry>();
  private readonly muted = new Set<string>();
  private lastOpenedUrl: string | null = null;

  constructor(private readonly deps: AppViewHostDeps) {}

  /** Dernière application ouverte : l'en-tête de la fenêtre la demande quand sa page est prête. */
  get lastOpened(): string | null {
    return this.lastOpenedUrl;
  }

  entry(url: string): ViewEntry | undefined {
    return this.entries.get(url);
  }

  isMuted(url: string): boolean {
    return this.muted.has(url);
  }

  /** @returns Les applications ouvertes ou dont le son est coupé */
  knownUrls(): string[] {
    return [...new Set([...this.entries.keys(), ...this.muted])];
  }

  /** @returns Les applications qui jouent un morceau, dans l'ordre d'ouverture */
  playingUrls(): string[] {
    return [...this.entries].filter(([, entry]) => entry.media).map(([url]) => url);
  }

  /** @returns L'application dont la page porte cet identifiant, `undefined` si aucune */
  urlOfWebContents(webContentsId: number): string | undefined {
    for (const [url, { view }] of this.entries) {
      if (!view.webContents.isDestroyed() && view.webContents.id === webContentsId) return url;
    }

    return undefined;
  }

  /** Ouvre l'application (la crée au premier appel) et l'affiche. */
  open(url: unknown): void {
    if (!this.deps.isSafeUrl(url)) return;

    this.lastOpenedUrl = url;
    const entry = this.entries.get(url) ?? this.create(url);
    entry.view.setVisible(true);
    entry.visible = true;

    this.deps.surface.show();
    this.deps.surface.announceOpened(url);
  }

  /** Cache l'application ; la fenêtre se ferme quand plus aucune n'est visible. */
  hide(url: string): void {
    const entry = this.entries.get(url);
    if (entry) {
      entry.view.setVisible(false);
      entry.visible = false;
    }

    if (![...this.entries.values()].some((other) => other.visible)) this.deps.surface.hide();
  }

  /** Détruit la vue de l'application, s'il y en a une. */
  discard(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;

    const { view } = entry;
    view.setVisible(false);
    this.deps.surface.removeChildView(view);
    view.webContents.stop();
    view.webContents.close();
    view.webContents.destroy?.();
    this.entries.delete(url);
    this.deps.onChange(url);
  }

  reload(url: string): void {
    this.entries.get(url)?.view.webContents.reload();
  }

  /** Bascule le son de l'application ; une adresse invalide est ignorée. */
  toggleMute(url: unknown): void {
    if (!this.deps.isSafeUrl(url)) return;

    const muted = !this.muted.has(url);
    if (muted) this.muted.add(url);
    else this.muted.delete(url);

    this.entries.get(url)?.view.webContents.setAudioMuted(muted);
    this.deps.onChange(url);
  }

  /** Enregistre ce que le site indique (non-lus, son, morceau) et le signale. */
  update(url: string, changes: IndicatorChanges): void {
    const entry = this.entries.get(url);
    if (!entry) return;

    if (changes.badge !== undefined) entry.badge = changes.badge;
    if (changes.audible !== undefined) entry.audible = changes.audible;
    if (changes.media !== undefined) entry.media = changes.media ?? undefined;

    this.deps.onChange(url);
  }

  /**
   * Commande le lecteur du site (lecture, pause, piste suivante...).
   * @returns `true` si la commande a été envoyée au site
   */
  controlMedia(url: unknown, action: unknown): boolean {
    const entry = typeof url === 'string' ? this.entries.get(url) : undefined;
    if (!entry?.media || !isMediaAction(action)) return false;

    entry.view.webContents.send(this.deps.mediaActionChannel, action);

    // Retour immédiat : la page confirmera dans la seconde qui suit
    if (action === 'play' || action === 'pause') {
      entry.media = { ...entry.media, playing: action === 'play' };
      this.deps.onChange(url as string);
    }

    return true;
  }

  private create(url: string): ViewEntry {
    const view = this.deps.createView();
    view.webContents.setAudioMuted(this.muted.has(url));

    const bounds = this.deps.surface.getBounds();
    view.setBounds({ x: 0, y: this.deps.headerHeight, width: bounds.width, height: Math.max(0, bounds.height - this.deps.headerHeight) });

    const entry: ViewEntry = { view, visible: false, badge: 0, audible: false, media: undefined };
    this.entries.set(url, entry);
    this.deps.surface.addChildView(view);
    this.followIndicators(url, view);
    view.webContents.loadURL(url).catch((error: unknown) => console.error(`Chargement de ${url} impossible`, error));

    return entry;
  }

  /** Suit le titre (non-lus) et l'état audio de la vue pour les afficher sur son bouton. */
  private followIndicators(url: string, view: AppView): void {
    view.webContents.on('page-title-updated', (_, title) => this.update(url, { badge: parseUnreadCount(title) }));
    view.webContents.on('audio-state-changed', (event) => this.update(url, { audible: event.audible }));
  }
}
