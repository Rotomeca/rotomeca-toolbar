import { HTMLPrimaryButton } from '../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';

export class Search {
  constructor() {
    this.main();
  }

  main() {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      const a = document.querySelectorAll(
        '.gsc-results-wrapper-nooverlay.gsc-results-wrapper-visible a',
      );
      a.forEach((link) => {
        link.setAttribute('data-href', link.getAttribute('href'));
        link.removeAttribute('href');
        link.style.pointerEvents = 'none';
      });

      const links = document.querySelectorAll('.gsc-webResult a.gs-title');
      links.forEach((link) => {
        let button = HTMLPrimaryButton.CreateNode({ content: '+' });
        button.setAttribute('data-form', 'secondary');
        button.style.color = 'white';
        button.style.marginLeft = '5px';
        button.addEventListener(
          'click',
          function (href, title) {
            parent.api.invoke(appEventList.requestAddData, {
              name: title,
              url: href,
              picture: null,
            });
          }.bind(this, link.getAttribute('data-href'), link.textContent),
        );
        link.parentElement.appendChild(button);
        button = null;

        let img = document.createElement('img');
        img.setAttribute(
          'src',
          '../pictures/add_photo_alternate_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg',
        );
        img.style.width = '12px';
        button = HTMLPrimaryButton.CreateNode({ content: img });
        button.setAttribute('data-form', 'secondary');
        button.style.color = 'white';
        button.style.marginLeft = '5px';
        button.addEventListener(
          'click',
          function (href, title) {
            parent.api.invoke(appEventList.requestAddDataEdit, {
              name: title,
              url: href,
              picture: null,
            });
          }.bind(this, link.getAttribute('data-href'), link.textContent),
        );
        link.parentElement.appendChild(button);
        button = null;
        img = null;
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Démarre le module
   * @returns {Search}
   */
  static Run() {
    return new Search();
  }
}

Search.Run();
