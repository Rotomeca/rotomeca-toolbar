import { HTMLPrimaryButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { HTMLPrimaryPressedButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryPressedButton.js';
import { TAG_PREFIX } from '../../../lib/RotomecaWebComponents/libs/config.js';
import { EMPTY_STRING } from '../../../lib/RotomecaWebComponents/libs/constants.js';
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';
import { ToolbarAppData } from '../ToolbarAppData.js';
import { HTMLGrouppedButton } from './HTMLGrouppedButton.js';

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

    this.setAttribute('title', this.itemData.title);
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
    this.#_audioNode.appendChild(this.createText('🔊'));
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

    this.oncontextmenu = (ev) => {
      return;
      if (this.root.querySelector(HTMLGrouppedButton.TAG)) {
        return this.root.querySelector(HTMLGrouppedButton.TAG)?.remove?.();
      }

      let groupped = HTMLGrouppedButton.CreateNode();

      let btnDelete = HTMLPrimaryButton.CreateNode({ content: '🚮' }).addClass(
        'delete',
      );
      let edit = HTMLPrimaryButton.CreateNode({ content: '✏️' }).addClass(
        'edit',
      );

      btnDelete.onclick = (e) => {
        e.preventDefault();
        this.not = true;
        window.api.invoke('appDelete', this.itemData.link);
        this.remove();
      };

      edit.onclick = (e) => {
        e.preventDefault();
        this.not = true;
        window.api.invoke('appEdit', {
          url: this.itemData.link,
          picture: this.itemData.picture,
          title: this.itemData.title,
        });
      };

      const rules = StyleComponent.RuleClass.Write({
        ':host': {
          position: 'absolute',
          top: '-18px',
          left: '-2px',
        },
      });

      groupped.append(
        new StyleComponent().addSomeCss(rules).build(),
        btnDelete,
      );

      if (!this.isOnEditMode) groupped.appendChild(edit);

      this.root.appendChild(groupped);

      groupped = null;
      btnDelete = null;
      edit = null;
    };

    this.addEventListener('click', () => {
      if (this.root.querySelector(HTMLGrouppedButton.TAG)) {
        return this.root.querySelector(HTMLGrouppedButton.TAG).remove();
      }
    });

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLToolbarButton.CssRules);

      let style = document.createElement('style');
      style.appendChild(
        document.createTextNode(`@keyframes rainbow {
          to {
            filter: hue-rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .progress {
            animation: none;
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
    this.#_audioNode.textContent = this.#_muted ? '🔇' : '🔊';

    const states = [];
    if (this.#_badge > 0) states.push(`${this.#_badge} non lu(s)`);
    if (this.#_muted) states.push('son coupé');
    else if (this.#_audible) states.push('son en cours');
    if (this.#_ignored)
      states.push('lecture ignorée dans la barre des tâches : seul le premier lecteur est pris en compte');

    this.setAttribute(
      'title',
      states.length
        ? `${this.itemData.title} (${states.join(', ')})`
        : this.itemData.title,
    );
  }

  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        width: '40px',
        display: 'block',
        position: 'relative',
        'aspect-ratio': '1 / 1',
        'border-radius': '15px',
        'border-color': 'transparent !important',
        // La bordure est invisible : sans largeur, la boîte (et l'anneau de
        // progression) fait toujours 40px quel que soit l'état du bouton
        'border-width': '0 !important',
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
        // 'font-size: '20px',
      },
      img: {
        width: '24px',
        height: '24px',
      },
      p: {
        margin: '0px',
      },
      '.cover': {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        'object-fit': 'cover',
        'border-radius': '15px',
        'pointer-events': 'none',
      },
      // Anneau d'avancée fin, aux dimensions du contour : un arc-en-ciel évidé
      // par un masque : l'arc parcouru porte tout le spectre, le reste est grisé
      '.progress': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        padding: '2px',
        'box-sizing': 'border-box',
        'border-radius': '15px',
        background:
          'conic-gradient(#ff3b30 calc(var(--progress, 0%) * 0.0), #ffcc00 calc(var(--progress, 0%) * 0.1667), #34c759 calc(var(--progress, 0%) * 0.3333), #00c7be calc(var(--progress, 0%) * 0.5), #0a84ff calc(var(--progress, 0%) * 0.6667), #bf5af2 calc(var(--progress, 0%) * 0.8333), #ff3b30 calc(var(--progress, 0%) * 1.0), transparent 0), rgba(255, 255, 255, 0.18)',
        '-webkit-mask':
          'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        '-webkit-mask-composite': 'xor',
        'mask-composite': 'exclude',
        animation: 'rainbow 3s linear infinite',
        'pointer-events': 'none',
      },
      '.badge': {
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        'min-width': '16px',
        height: '16px',
        padding: '0 4px',
        'box-sizing': 'border-box',
        'border-radius': '8px',
        background: '#e53935',
        color: '#fff',
        'font-size': '10px',
        'font-weight': 'bold',
        'line-height': '16px',
        'text-align': 'center',
        'pointer-events': 'none',
      },
      '.audio': {
        position: 'absolute',
        bottom: '-2px',
        right: '-2px',
        'font-size': '11px',
        'line-height': '1',
        'pointer-events': 'none',
      },
      '[hidden]': {
        display: 'none',
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
