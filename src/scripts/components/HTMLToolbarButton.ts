/**
 * Composant web du bouton d'une application dans la barre : icône, non-lus, son, pochette, avancement.
 *
 * Utilisé par la page de la barre (`src/page.taskbar/`). Dépend de `lib/RotomecaWebComponents`
 * (bouton à bascule) et de `ToolbarAppData` ; les indicateurs sont poussés par le processus principal.
 */
// [HTMLPrimaryPressedButton.d.ts] bouton à bascule de la bibliothèque Rotomeca (composant web)
import { HTMLPrimaryPressedButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryPressedButton.js';
// [CustomWebComponentCustomEvent.d.ts] Évènement émis par un composant : `caller` est le composant qui l'a émis
import type { CustomWebComponentCustomEvent } from '../../../lib/RotomecaWebComponents/events/CustomWebComponentCustomEvent.js';
// [config.d.ts] Préfixe des balises des composants de la bibliothèque (`rotomeca-...`)
import { TAG_PREFIX } from '../../../lib/RotomecaWebComponents/libs/config.js';
// [constants.d.ts] Chaîne vide : améliore la lisibilité du code
import { EMPTY_STRING } from '../../../lib/RotomecaWebComponents/libs/constants.js';
// [StyleComponent.d.ts] Une règle CSS produite par `StyleComponent.RuleClass.Write`
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';
import type { Rule } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { IndicatorsDto } from '../../shared/dto.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList } from '../../shared/ipc/events.js';
// [ToolbarAppData.ts] Données d'une application affichée sur un bouton de la barre : adresse, titre, image
import { ToolbarAppData } from '../ToolbarAppData.js';

/** Déclare les évènements de bascule du bouton et sa balise dans les cartes de types du DOM. */
declare global {
  interface HTMLElementEventMap {
    'event:custom:state.pressed': CustomWebComponentCustomEvent<HTMLToolbarButton>;
    'event:custom:state.unpressed': CustomWebComponentCustomEvent<HTMLToolbarButton>;
  }

  interface HTMLElementTagNameMap {
    'rotomeca-toolbar-button': HTMLToolbarButton;
  }
}

/** Indicateurs affichés sur un bouton : l'adresse de l'application n'en fait pas partie. */
export type ButtonIndicators = Partial<Omit<IndicatorsDto, 'url'>>;

/**
 * Traduit une clé (le preload expose `window.api.t`).
 * @param key Clé de traduction
 * @param variables Valeurs à insérer dans le texte
 * @returns Le texte traduit, ou la clé elle-même si l'API n'est pas disponible
 */
const translate = (key: string, variables?: Record<string, string | number>): string => window.api?.t?.(key, variables) ?? key;

/** Le plus grand nombre de messages non lus affiché tel quel. */
const MAX_BADGE = 99;

/** Bouton d'une application dans la barre : son icône, et ses indicateurs (non-lus, son, morceau). */
export class HTMLToolbarButton extends HTMLPrimaryPressedButton {
  /** Données de l'application, lues une fois depuis les attributs de données. */
  #itemData: ToolbarAppData | null = null;
  /** Nombre de messages non lus. */
  #badge = 0;
  /** L'application émet du son. */
  #audible = false;
  /** L'application est mise en sourdine. */
  #muted = false;
  /** Adresse de la pochette du morceau en cours. */
  #cover: string | null = null;
  /** L'application joue un morceau. */
  #hasMedia = false;
  /** Avancement du morceau entre 0 et 1, `null` s'il est inconnu. */
  #progress: number | null = null;
  /** Les notifications de l'application sont ignorées. */
  #ignored = false;
  /** Anneau d'avancement. */
  #progressNode: HTMLSpanElement | null = null;
  /** Pochette ronde. */
  #coverNode: HTMLImageElement | null = null;
  /** Pastille des non-lus. */
  #badgeNode: HTMLSpanElement | null = null;
  /** Pastille du son. */
  #audioNode: HTMLSpanElement | null = null;
  /** Icône de la pastille du son (haut-parleur, ou barré en sourdine). */
  #audioIcon: HTMLElement | null = null;

  /** Données de l'application (adresse, titre, image) portées par le bouton. */
  get itemData(): ToolbarAppData {
    this.#itemData ??= new ToolbarAppData(
      this._p_get_data('url') ?? EMPTY_STRING,
      this._p_get_data('title') ?? EMPTY_STRING,
      this._p_get_data('picture'),
    );

    return this.#itemData;
  }

  /** Le bouton est en mode édition : un clic ne doit pas ouvrir l'application. */
  get isOnEditMode(): boolean {
    return this.classList.contains('edit');
  }

  /** L'application joue un morceau. */
  get hasMedia(): boolean {
    return this.#hasMedia;
  }

  /** Construit le contenu du bouton : icône, indicateurs et styles (dont l'animation du mode édition). */
  protected override _p_main(): void {
    super._p_main();
    this.setAttribute('id', this.getAttribute('id') || this._p_generate_id());

    const { title, link } = this.itemData;
    this.dataset.tooltip = title;
    this.setAttribute('aria-label', title);
    this.setAttribute('href', link);

    const mainDiv = document.createElement('div');
    mainDiv.appendChild(this.#createIcon());
    this.root.appendChild(mainDiv);

    this.#createIndicatorNodes();
    this.#renderIndicators();

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLToolbarButton.CssRules);

      const style = document.createElement('style');
      style.appendChild(
        document.createTextNode(`@media (prefers-reduced-motion: reduce) {
          :host(.edit) img, :host(.edit) p, :host(.edit) i {
            animation: none !important;
          }
        }
        @keyframes tremble {
          0% {
            transform: rotate(0);
          }
          25% {
            transform: rotate(-10deg);
          }
          50% {
            transform: rotate(10deg);
          }
          75% {
            transform: rotate(-10deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }`),
      );

      this.root.appendChild(style);


      this.root.appendChild(style);
    }
  }

  /**
   * Met à jour les indicateurs (non-lus, son, morceau) et les affiche.
   * @param indicators Nouvel état ; une valeur absente revient à sa valeur neutre
   * @returns Le bouton, pour enchaîner les appels
   */
  setIndicators({
    badge = 0,
    audible = false,
    muted = false,
    cover = null,
    hasMedia = false,
    progress = null,
    ignored = false,
  }: ButtonIndicators = {}): this {
    this.#ignored = ignored;
    this.#progress = progress;
    this.#badge = badge;
    this.#audible = audible;
    this.#muted = muted;
    this.#hasMedia = hasMedia;
    this.#cover = cover;
    this.#renderIndicators();

    return this;
  }

  /**
   * Crée l'icône de l'application.
   * @returns L'icône de l'application : sa police d'icônes, son image, ou son favicon (puis sa première lettre)
   */
  #createIcon(): HTMLElement {
    const { picture, path, link } = this.itemData;

    // Nom de police strict : un nom avec espace ferait lever `classList.add` et stopperait toute la barre
    if (picture && /^font:[\w-]{1,64}$/.test(picture)) {
      const icon = document.createElement('i');
      icon.classList.add(`icofont-${picture.replace('font:', '')}`);

      const stylesheet = document.createElement('link');
      stylesheet.setAttribute('rel', 'stylesheet');
      stylesheet.setAttribute('href', '../css/fonts/icofont/icofont.min.css');
      this.root.appendChild(stylesheet);

      return icon;
    }

    const image = document.createElement('img');
    if (picture) {
      image.src = picture;
    } else {
      // Le processus principal cherche l'icône dans la page du site (et la garde) ; la première lettre sert de repli
      this.#loadFavicon(image, link, path);
    }

    return image;
  }

  /**
   * Affiche l'icône du site, ou sa première lettre si elle n'existe pas.
   * @param image Élément d'image du bouton
   * @param link Adresse de l'application
   * @param path Racine du site, utilisée seulement si le processus principal ne répond pas
   */
  #loadFavicon(image: HTMLImageElement, link: string, path: string): void {
    const showInitial = (): void => {
      const initial = document.createElement('p');
      initial.appendChild(this.createText(this.itemData.title.slice(0, 1)));

      this.root.querySelector('div')?.appendChild(initial);
      image.remove();
    };

    if (!window.api?.invoke) {
      image.onerror = showInitial;
      image.src = `${path}/favicon.ico`;
      return;
    }

    window.api.invoke(appEventList.getFavicon, link)
      .then((icon) => {
        if (typeof icon === 'string') image.src = icon;
        else showInitial();
      })
      .catch(showInitial);
  }

  /** Crée les éléments des indicateurs (pochette, anneau, pastilles) et garde leurs références. */
  #createIndicatorNodes(): void {
    const badgeNode = document.createElement('span');
    badgeNode.classList.add('badge');

    const audioIcon = document.createElement('rds-icon');
    audioIcon.setAttribute('name', 'volume-2');
    const audioNode = document.createElement('span');
    audioNode.classList.add('audio');
    audioNode.setAttribute('aria-hidden', 'true');
    audioNode.appendChild(audioIcon);

    const coverNode = document.createElement('img');
    coverNode.classList.add('cover');
    coverNode.alt = '';
    coverNode.onerror = () => {
      coverNode.hidden = true;
    };

    const progressNode = document.createElement('span');
    progressNode.classList.add('progress');
    progressNode.setAttribute('aria-hidden', 'true');

    this.root.append(coverNode, progressNode, badgeNode, audioNode);

    this.#badgeNode = badgeNode;
    this.#audioNode = audioNode;
    this.#audioIcon = audioIcon;
    this.#coverNode = coverNode;
    this.#progressNode = progressNode;
  }

  /** Reporte l'état des indicateurs dans le DOM, ainsi que dans le libellé accessible et l'infobulle. */
  #renderIndicators(): void {
    const nodes = { badge: this.#badgeNode, audio: this.#audioNode, icon: this.#audioIcon, cover: this.#coverNode, progress: this.#progressNode };
    if (!nodes.badge || !nodes.audio || !nodes.icon || !nodes.cover || !nodes.progress) return;

    if (this.#cover) {
      if (nodes.cover.getAttribute('src') !== this.#cover) nodes.cover.src = this.#cover;
      nodes.cover.hidden = false;
    } else {
      nodes.cover.hidden = true;
      nodes.cover.removeAttribute('src');
    }

    nodes.progress.hidden = this.#progress === null;
    nodes.progress.style.setProperty('--progress', `${Math.round((this.#progress ?? 0) * 100)}%`);

    nodes.badge.hidden = this.#badge <= 0;
    nodes.badge.textContent = this.#badge > MAX_BADGE ? `${MAX_BADGE}+` : String(this.#badge);
    nodes.audio.hidden = !this.#audible && !this.#muted;
    nodes.icon.setAttribute('name', this.#muted ? 'volume-x' : 'volume-2');

    const label = this.#describeStates();
    this.setAttribute('aria-label', label ? `${this.itemData.title} (${label})` : this.itemData.title);
    this.dataset.tooltip = this.itemData.title;
    if (this.#badge > 0) this.dataset.tooltipBadge = nodes.badge.textContent;
    else delete this.dataset.tooltipBadge;
  }

  /**
   * Décrit les états du bouton pour les lecteurs d'écran.
   * @returns Les états du bouton, en toutes lettres
   */
  #describeStates(): string {
    const states: string[] = [];
    if (this.#badge > 0) states.push(translate('button.unread', { count: this.#badge }));
    if (this.#muted) states.push(translate('button.muted'));
    else if (this.#audible) states.push(translate('button.audible'));
    if (this.#ignored) states.push(translate('button.ignored'));

    return states.join(', ');
  }

  /** Règles CSS du bouton : tuile ronde, état enfoncé, mode édition et indicateurs. */
  static override get CssRules(): Rule[] {
    return StyleComponent.RuleClass.Write({
      ':host': {
        width: '44px',
        display: 'block',
        position: 'relative',
        'box-sizing': 'border-box',
        'aspect-ratio': '1 / 1',
        'flex-shrink': '0',
        'border-radius': 'var(--ds-radius-full, 999px)',
        'border-style': 'solid !important',
        'border-width': '1px !important',
        'border-color': 'var(--ds-border-subtle) !important',
        'background-color': 'var(--ds-background-surface-strong)',
        color: 'var(--ds-text-default)',
        'font-size': '20px',
        cursor: 'pointer',
      },
      ':host(:hover), :host(:active)': {
        'border-color': 'var(--ds-border-strong) !important',
        'background-color': 'var(--ds-background-surface-strong)',
        color: 'var(--ds-text-default)',
      },
      ':host(:focus-visible)': {
        outline: '2px solid var(--ds-focus-ring-color)',
        'outline-offset': '2px',
        'box-shadow': 'none',
      },
      // Raccourci actif : tuile arrondie, avec un trait collé au bord de la barre
      ':host(:state(pressed)), :host(:state(pressed):hover), :host(:state(pressed):active)': {
        'border-radius': '14px',
        'border-color': 'transparent !important',
        'background-color': 'var(--ds-background-tone-brand-bold)',
        color: 'var(--ds-text-tone-brand-bold)',
      },
      ':host(:state(pressed))::before': {
        content: '""',
        position: 'absolute',
        top: '10px',
        left: '-14px',
        width: '4px',
        height: '24px',
        'border-radius': '0 4px 4px 0',
        background: 'var(--ds-background-action-primary)',
      },
      ':host(.edit) img, :host(.edit) p, :host(.edit) i': {
        animation: 'tremble 0.5s infinite',
      },
      div: {
        width: '100%',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
      },
      img: {
        width: '24px',
        height: '24px',
      },
      p: {
        margin: '0px',
        'font-family': 'var(--ds-font-sans)',
        'font-weight': '600',
      },
      // Pochette ronde de 40 px au centre de la tuile de 44 px
      '.cover': {
        position: 'absolute',
        top: '1px',
        left: '1px',
        width: '40px',
        height: '40px',
        'object-fit': 'cover',
        'border-radius': 'var(--ds-radius-full, 999px)',
        'pointer-events': 'none',
      },
      // Anneau d'avancée de 52 px : piste border-subtle, progression action-primary,
      // départ à 12 h (évidé par un masque)
      '.progress': {
        position: 'absolute',
        top: '-5px',
        left: '-5px',
        width: '52px',
        height: '52px',
        padding: '3px',
        'box-sizing': 'border-box',
        'border-radius': 'var(--ds-radius-full, 999px)',
        background:
          'conic-gradient(var(--ds-background-action-primary) var(--progress, 0%), var(--ds-border-subtle) 0)',
        '-webkit-mask':
          'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        '-webkit-mask-composite': 'xor',
        'mask-composite': 'exclude',
        'pointer-events': 'none',
      },
      // Pastille de notification : coin haut droit, chiffre centré
      '.badge': {
        position: 'absolute',
        top: '-4px',
        right: '-6px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'min-width': '18px',
        height: '18px',
        padding: '0 4px',
        'box-sizing': 'border-box',
        'border-radius': 'var(--ds-radius-full, 999px)',
        border: '2px solid var(--ds-background-surface-variant)',
        background: 'var(--ds-background-tone-accent-bold)',
        color: 'var(--ds-text-tone-accent-bold)',
        'font-size': '10px',
        'font-weight': '700',
        'line-height': '1',
        'font-variant-numeric': 'tabular-nums',
        'pointer-events': 'none',
      },
      // Pastille son : coin bas droit
      '.audio': {
        position: 'absolute',
        bottom: '-4px',
        right: '-4px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        width: '20px',
        height: '20px',
        'box-sizing': 'border-box',
        'border-radius': 'var(--ds-radius-full, 999px)',
        border: '2px solid var(--ds-background-surface-variant)',
        background: 'var(--ds-background-action-primary)',
        color: 'var(--ds-text-action-primary)',
        'font-size': '10px',
        'line-height': '1',
        'pointer-events': 'none',
      },
      '[hidden]': {
        display: 'none !important',
      },
    });
  }

  /**
   * Crée le bouton d'une application.
   * @param url Adresse de l'application
   * @param title Titre affiché
   * @param options Image du bouton (`data:` ou `font:nom`), sinon le favicon du site
   * @returns Le bouton, pas encore ajouté à la page
   */
  static CreateNode(url: string, title: string, { picture = null }: { picture?: string | null } = {}): HTMLToolbarButton {
    const node = document.createElement(this.TAG) as HTMLToolbarButton;

    if (picture && picture !== EMPTY_STRING) node.setData('picture', picture);

    return node.setData('url', url).setData('title', title);
  }

  /** Nom de la balise du composant. */
  static override get TAG(): string {
    return `${TAG_PREFIX}-toolbar-button`;
  }

  /**
   * Cherche le bouton d'une application dans la page.
   * @param url Adresse de l'application
   * @returns Le bouton de cette application, `null` si elle n'est pas dans la barre
   */
  static Select(url: string): HTMLToolbarButton | null {
    for (const element of document.querySelectorAll<HTMLToolbarButton>(this.TAG)) {
      if (element.itemData.link === url) return element;
    }

    return null;
  }
}

HTMLToolbarButton.TryDefine(HTMLToolbarButton.TAG, HTMLToolbarButton);
