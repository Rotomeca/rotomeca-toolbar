import { normalizeUrl } from '../scripts/appForm.js';
import { requireElement } from '../scripts/dom.js';
import type { PopularApp } from '../types/window-electron.js';
import { appEventList } from '../shared/ipc/events.js';

/** Jetons du thème recopiés dans l'iframe de recherche (qui n'hérite pas des --ds-*). */
const THEME_TOKENS = [
  '--ds-body-background-color',
  '--ds-background-surface',
  '--ds-background-surface-variant',
  '--ds-background-surface-strong',
  '--ds-border-subtle',
  '--ds-border-strong',
  '--ds-text-default',
  '--ds-text-muted',
  '--ds-text-action-tertiary',
  '--ds-background-action-primary',
  '--ds-background-action-primary-hover',
  '--ds-text-action-primary',
  '--ds-background-tone-success',
  '--ds-text-tone-success',
  '--ds-input-background',
  '--ds-input-text',
  '--ds-input-hint',
  '--ds-input-border',
  '--ds-input-radius',
  '--ds-focus-ring-color',
  '--ds-font-sans',
] as const;

/** Messages échangés avec l'iframe de recherche. */
const MESSAGE_READY = 'rotomecaSearchReady';
const MESSAGE_THEME = 'rotomecaTheme';
const MESSAGE_SAVED = 'rotomecaSaved';

type AddRequestType = typeof appEventList.requestAddData | typeof appEventList.requestAddDataEdit;

interface AddRequest {
  readonly name: string;
  readonly url: string;
  readonly picture: string | null;
}

const isAddRequestType = (type: unknown): type is AddRequestType =>
  type === appEventList.requestAddData || type === appEventList.requestAddDataEdit;

/** @returns `true` si l'adresse est une adresse http(s) valide */
function isWebUrl(url: unknown): url is string {
  try {
    return typeof url === 'string' && ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    // Adresse illisible : refusée
    return false;
  }
}

/** La page d'ajout d'une application : sites populaires, et recherche (iframe sandboxée). */
class AddPage {
  /** Adresses déjà dans la barre (formes normalisées). */
  private readonly saved = new Set<string>();
  private searchCss = '';
  private frameReady = false;
  /** Icône d'origine d'un bouton populaire marqué « Ajouté » (remplacée par une coche). */
  private readonly previousIcons = new WeakMap<HTMLElement, Node[]>();

  private get frame(): HTMLIFrameElement {
    return requireElement<HTMLIFrameElement>('iframe');
  }

  async start(): Promise<void> {
    // Attendre que le DOM soit chargé pour lancer la frame
    window.addEventListener('DOMContentLoaded', () => {
      this.frame.setAttribute('src', this.frame.getAttribute('data-src') ?? '');
    });

    // Habillage du widget Google : lu ici, injecté dans l'iframe (qui ne lit aucun fichier local)
    const cssLoaded = fetch('./google-search.css')
      .then((response) => response.text())
      .then((css) => {
        this.searchCss = css;
      })
      .catch((error: unknown) => console.error('google-search.css', error));

    // Thème : le processus principal change data-theme / data-palette, on retransmet
    new MutationObserver(() => this.pushTheme()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-palette'],
    });

    // Messages venant de l'iframe de recherche (sandboxée, sans accès à l'IPC)
    window.addEventListener('message', (event) => {
      this.onFrameMessage(event, cssLoaded).catch(console.error);
    });

    for (const url of await window.api.invoke(appEventList.getSavedUrls)) this.saved.add(normalizeUrl(url));

    const root = requireElement('#predefined-apps');
    for (const app of await this.loadPopularApps()) root.appendChild(this.createPopular(app));

    this.refreshPopular();
    this.pushSaved();
  }

  /** @returns La liste des applications par défaut (`configs/config.json`) */
  private async loadPopularApps(): Promise<readonly PopularApp[]> {
    try {
      const response = await fetch('../../configs/config.json');
      const config = (await response.json()) as { default_apps?: readonly PopularApp[] };
      return config.default_apps ?? [];
    } catch (error) {
      console.log(`error: ${String(error)}`);
      return [];
    }
  }

  private async onFrameMessage(event: MessageEvent<unknown>, cssLoaded: Promise<unknown>): Promise<void> {
    if (event.source !== this.frame.contentWindow) return;

    const { type, name, url } = (event.data ?? {}) as { type?: unknown; name?: unknown; url?: unknown };

    if (type === MESSAGE_READY) {
      await cssLoaded;
      this.frameReady = true;
      this.pushTheme();
      this.pushSaved();
      return;
    }

    if (!isAddRequestType(type) || !isWebUrl(url)) return;

    await this.request(type, { name: typeof name === 'string' ? name : url, url, picture: null });
  }

  /** Envoie un message à l'iframe de recherche (origine opaque : cible « * »). */
  private post(message: unknown): void {
    this.frame.contentWindow?.postMessage(message, '*');
  }

  /** Envoie à l'iframe le thème courant : feuille Google, jetons résolus et libellés. */
  private pushTheme(): void {
    if (!this.frameReady) return;

    const style = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries(THEME_TOKENS.map((name) => [name, style.getPropertyValue(name).trim()]));

    this.post({
      type: MESSAGE_THEME,
      css: this.searchCss,
      tokens,
      scheme: document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark',
      labels: {
        add: window.api.t('add.addToBar'),
        customize: window.api.t('add.customize'),
        added: window.api.t('add.added'),
      },
    });
  }

  private pushSaved(): void {
    if (this.frameReady) this.post({ type: MESSAGE_SAVED, urls: [...this.saved] });
  }

  /** Demande l'ajout (ou l'ajout avec personnalisation) d'un site. */
  private async request(type: AddRequestType, data: AddRequest): Promise<void> {
    if (type === appEventList.requestAddDataEdit) {
      await window.api.invoke(type, data);
      return;
    }

    // La fenêtre reste ouverte après un ajout direct : on le signale aux deux listes
    if (await window.api.invoke(type, data)) {
      this.saved.add(normalizeUrl(data.url));
      this.refreshPopular();
      this.pushSaved();
    }
  }

  /** Un bouton « populaire » : icône ronde et nom. */
  private createPopular(app: PopularApp): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'popular';
    button.dataset['url'] = app.url;
    button.setAttribute('aria-label', window.api.t('add.addNamed', { name: app.title }));

    const icon = document.createElement('span');
    icon.className = 'popular-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(this.createPopularIcon(app));

    const name = document.createElement('span');
    name.className = 'popular-name';
    name.textContent = app.title;

    button.append(icon, name);
    button.addEventListener('click', () => {
      this.request(appEventList.requestAddData, { name: app.title, url: app.url, picture: app.icon ?? null }).catch(console.error);
    });

    return button;
  }

  /** @returns L'icône d'une application populaire : police d'icônes, image, ou sa première lettre */
  private createPopularIcon(app: PopularApp): Node {
    if (typeof app.icon === 'string' && app.icon.startsWith('font:')) {
      const glyph = document.createElement('i');
      glyph.className = `icofont-${app.icon.slice('font:'.length)}`;
      return glyph;
    }

    if (app.icon) {
      const image = document.createElement('img');
      image.src = app.icon;
      image.alt = '';
      return image;
    }

    return document.createTextNode(app.title.slice(0, 1));
  }

  /** Marque « Ajouté » les populaires déjà dans la barre. */
  private refreshPopular(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('#predefined-apps .popular')) {
      const added = this.saved.has(normalizeUrl(button.dataset['url'] ?? ''));
      button.classList.toggle('added', added);
      button.disabled = added;

      const icon = button.querySelector<HTMLElement>('.popular-icon');
      if (!icon) continue;

      const previous = this.previousIcons.get(icon);
      if (added && !icon.querySelector('rds-icon')) {
        this.previousIcons.set(icon, [...icon.childNodes]);
        const check = document.createElement('rds-icon');
        check.setAttribute('name', 'check');
        icon.replaceChildren(check);
      } else if (!added && previous) {
        icon.replaceChildren(...previous);
        this.previousIcons.delete(icon);
      }
    }
  }
}

new AddPage().start().catch(console.error);
