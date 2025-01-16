import { HTMLPrimaryButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { HTMLPrimaryPressedButton } from '../../../lib/RotomecaWebComponents/component/HTMLPrimaryPressedButton.js';
import { TAG_PREFIX } from '../../../lib/RotomecaWebComponents/libs/config.js';
import { EMPTY_STRING } from '../../../lib/RotomecaWebComponents/libs/constants.js';
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';
import { ToolbarAppData } from '../ToolbarAppData.js';
import { HTMLGrouppedButton } from './HTMLGrouppedButton.js';

export class HTMLToolbarButton extends HTMLPrimaryPressedButton {
  #_itemData = null;
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
        document.createTextNode(`@keyframes tremble {
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

  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        width: '40px',
        display: 'block',
        position: 'relative',
        'aspect-ratio': '1 / 1',
        'border-radius': '15px',
        'border-color': 'transparent !important',
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
