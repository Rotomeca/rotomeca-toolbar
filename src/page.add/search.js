// Script classique (pas de module ni d'import) : la page est dans une iframe
// sandboxée (origine opaque) qui charge un script Google distant. Elle n'a
// aucun accès à l'IPC : elle ne peut que demander à la page parente, par
// `postMessage`, d'ajouter un lien (la page parente valide la demande).
(function () {
  const MESSAGE_ADD = 'requestAddData';
  const MESSAGE_ADD_EDIT = 'requestAddDataEdit';
  const ICON_PATH =
    '../pictures/add_photo_alternate_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg';

  function createButton(content, type, name, url) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText =
      'margin-left:5px;padding:2px 8px;border:0;border-radius:4px;' +
      'background:#3b4a6b;color:#fff;cursor:pointer;vertical-align:middle;';

    if (typeof content === 'string') button.textContent = content;
    else button.appendChild(content);

    button.addEventListener('click', () => {
      parent.postMessage({ type, name, url }, '*');
    });

    return button;
  }

  function decorate() {
    // Neutralise les liens des résultats : on ne navigue pas dans l'iframe
    document
      .querySelectorAll(
        '.gsc-results-wrapper-nooverlay.gsc-results-wrapper-visible a',
      )
      .forEach((link) => {
        if (link.hasAttribute('href')) {
          link.setAttribute('data-href', link.getAttribute('href'));
          link.removeAttribute('href');
        }
        link.style.pointerEvents = 'none';
      });

    document.querySelectorAll('.gsc-webResult a.gs-title').forEach((link) => {
      if (link.parentElement.querySelector('[data-rotomeca-add]')) return;

      const url = link.getAttribute('data-href');
      if (!url) return;
      const name = link.textContent;

      const add = createButton('+', MESSAGE_ADD, name, url);
      add.setAttribute('data-rotomeca-add', '');
      link.parentElement.appendChild(add);

      const img = document.createElement('img');
      img.setAttribute('src', ICON_PATH);
      img.style.width = '12px';
      link.parentElement.appendChild(
        createButton(img, MESSAGE_ADD_EDIT, name, url),
      );
    });
  }

  const observer = new MutationObserver(() => {
    // Évite de se redéclencher sur nos propres modifications du DOM
    observer.disconnect();
    decorate();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
