import { HTMLPrimaryPressedButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryPressedButton.js';
import { TAG_PREFIX } from '../../../lib/RotomecaWebComponents/libs/config.js';
import { EMPTY_STRING } from '../../../lib/RotomecaWebComponents/libs/constants.js';
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';
import { ToolbarAppData } from '../ToolbarAppData.js';

/**
 * Traduit une clé (le preload expose `window.api.t`).
 * @param {string} key
 * @param {Object<string, string|number>} [vars]
 * @returns {string}
 */
const translate = (key, vars) => window.api?.t?.(key, vars) ?? key;

export class HTMLToolbarButton extends HTMLPrimaryPressedButton {
  #_itemData = null;
  #_badge = 0;
  #_audible = false;
  #_muted = false;
  #_cover = null;
  #_hasMedia = false;
  #_progress = null;
  #_ignored = false;
  #_progressNode = null;
  #_coverNode = null;
  #_badgeNode = null;
  #_audioNode = null;
  #_audioIcon = null;
  constructor() {
    super();
  }

  /**
   * @type {ToolbarAppData}
   * @readonly
   */
  get itemData() {
    if (!this.#_itemData) {
      this.#_itemData = new ToolbarAppData(
        this._p_get_data('url'),
        this._p_get_data('title'),
        this._p_get_data('picture'),
      );
    }

    return this.#_itemData;
  }

  get isOnEditMode() {
    return this.classList.contains('edit');
  }

  _p_main() {
    super._p_main();
    this.setAttribute('id', this.getAttribute('id') || this._p_generate_id());

    this.dataset.tooltip = this.itemData.title;
    this.setAttribute('aria-label', this.itemData.title);
    this.setAttribute('href', this.itemData.link);

    let childNode;

    if (this.itemData.hasPicture()) {
      if (this.itemData.picture.includes('font:')) {
        childNode = document.createElement('i');
        childNode.classList.add(
          `icofont-${this.itemData.picture.replaceAll('font:', '')}`,
        );
        let tmp = document.createElement('link');
        tmp.setAttribute('rel', 'stylesheet'); //<link rel="stylesheet" href="../css/fonts/icofont/icofont.min.css" />,
        tmp.setAttribute('href', '../css/fonts/icofont/icofont.min.css');
        this.root.appendChild(tmp);
      } else {
        childNode = document.createElement('img');
        childNode.src = this.itemData.picture;
      }
    } else {
      childNode = document.createElement('img');
      childNode.src = this.itemData.path + '/favicon.ico';
      childNode.onerror = (e) => {
        let p = document.createElement('p');
        p.appendChild(this.createText(this.itemData.title.slice(0, 1)));

        this.root.querySelector('div').appendChild(p);

        p = null;
        e.currentTarget.remove();
      };
    }

    let mainDiv = document.createElement('div');
    mainDiv.appendChild(childNode);

    this.root.appendChild(mainDiv);

    this.#_badgeNode = document.createElement('span');
    this.#_badgeNode.classList.add('badge');
    this.#_audioNode = document.createElement('span');
    this.#_audioNode.classList.add('audio');
    this.#_audioNode.setAttribute('aria-hidden', 'true');
    this.#_audioIcon = document.createElement('rds-icon');
    this.#_audioIcon.setAttribute('name', 'volume-2');
    this.#_audioNode.appendChild(this.#_audioIcon);
    this.#_coverNode = document.createElement('img');
    this.#_coverNode.classList.add('cover');
    this.#_coverNode.alt = '';
    this.#_coverNode.onerror = () => {
      this.#_coverNode.hidden = true;
    };
    this.#_progressNode = document.createElement('span');
    this.#_progressNode.classList.add('progress');
    this.#_progressNode.setAttribute('aria-hidden', 'true');
    this.root.append(
      this.#_coverNode,
      this.#_progressNode,
      this.#_badgeNode,
      this.#_audioNode,
    );
    this.#_renderIndicators();

    childNode = null;
    mainDiv = null;

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLToolbarButton.CssRules);

      let style = document.createElement('style');
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

      style = null;
    }
  }

  /**
   * Met à jour les indicateurs affichés sur le bouton.
   * @param {Object} [indicators]
   * @param {number} [indicators.badge=0] Nombre de non-lus (0 = aucun badge)
   * @param {boolean} [indicators.audible=false] Le site émet du son
   * @param {boolean} [indicators.muted=false] Le son du site est coupé
   * @param {?string} [indicators.cover=null] Pochette du morceau en cours
   * @param {boolean} [indicators.hasMedia=false] Un morceau est exposé par le site
   * @param {?number} [indicators.progress=null] Avancée du morceau (0 à 1)
   * @param {boolean} [indicators.ignored=false] Lecture non reflétée dans la barre des tâches
   * @returns {this}
   */
  setIndicators({
    badge = 0,
    audible = false,
    muted = false,
    cover = null,
    hasMedia = false,
    progress = null,
    ignored = false,
  } = {}) {
    this.#_ignored = ignored;
    this.#_progress = progress;
    this.#_badge = badge;
    this.#_audible = audible;
    this.#_muted = muted;
    this.#_hasMedia = hasMedia;
    this.#_cover = cover;
    this.#_renderIndicators();

    return this;
  }

  /**
   * Un morceau est en cours (le lecteur peut s'afficher au survol).
   * @type {boolean}
   * @readonly
   */
  get hasMedia() {
    return this.#_hasMedia;
  }

  #_renderIndicators() {
    if (!this.#_badgeNode) return;

    if (this.#_cover) {
      if (this.#_coverNode.getAttribute('src') !== this.#_cover)
        this.#_coverNode.src = this.#_cover;
      this.#_coverNode.hidden = false;
    } else {
      this.#_coverNode.hidden = true;
      this.#_coverNode.removeAttribute('src');
    }

    this.#_progressNode.hidden = this.#_progress === null;
    this.#_progressNode.style.setProperty(
      '--progress',
      `${Math.round((this.#_progress ?? 0) * 100)}%`,
    );

    this.#_badgeNode.hidden = this.#_badge <= 0;
    this.#_badgeNode.textContent = this.#_badge > 99 ? '99+' : this.#_badge;
    this.#_audioNode.hidden = !this.#_audible && !this.#_muted;
    this.#_audioIcon.setAttribute(
      'name',
      this.#_muted ? 'volume-x' : 'volume-2',
    );

    const states = [];
    if (this.#_badge > 0) states.push(translate('button.unread', { count: this.#_badge }));
    if (this.#_muted) states.push(translate('button.muted'));
    else if (this.#_audible) states.push(translate('button.audible'));
    if (this.#_ignored)
      states.push(translate('button.ignored'));

    const label = states.length
      ? `${this.itemData.title} (${states.join(', ')})`
      : this.itemData.title;
    this.setAttribute('aria-label', label);
    this.dataset.tooltip = this.itemData.title;
    if (this.#_badge > 0) this.dataset.tooltipBadge = this.#_badgeNode.textContent;
    else delete this.dataset.tooltipBadge;
  }

  static get CssRules() {
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
   *
   * @param {*} url
   * @param {*} title
   * @param {*} param2
   * @returns {HTMLToolbarButton}
   */
  static CreateNode(url, title, { picture = null } = {}) {
    /**
     * @type {HTMLToolbarButton}
     */
    let node = document.createElement(this.TAG);

    if (picture && picture !== EMPTY_STRING) {
      node.setData('picture', picture);
    }

    return node.setData('url', url).setData('title', title);
  }

  static get TAG() {
    return `${TAG_PREFIX}-toolbar-button`;
  }

  /**
   *
   * @param {string} url
   * @returns {?HTMLToolbarButton}
   */
  static Select(url) {
    /**
     * @type {HTMLToolbarButton}
     */
    let element = null;
    for (element of document.querySelectorAll(this.TAG)) {
      if (element.itemData.link === url) return element;
      else element = null;
    }

    return null;
  }
}

HTMLToolbarButton.TryDefine(HTMLToolbarButton.TAG, HTMLToolbarButton);
