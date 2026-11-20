/**
 * Script injecté dans les sites : transmet le clic droit à la fenêtre du menu contextuel.
 *
 * Lu comme texte par le processus principal puis exécuté par `executeJavaScript`. Dépend de `window.api`.
 */

// Script injecté dans chaque page de l'application (lu comme du texte par le processus principal) :
// il transmet le clic droit à la fenêtre qui affiche le menu. Ce fichier n'est donc PAS un module
// (pas d'import ni d'export statiques) ; l'import dynamique est résolu depuis l'adresse de la page.
document.addEventListener('contextmenu', async (event) => {
  const { appEventList } = await import('../shared/ipc/events.js');

  const node = event.target;
  if (!(node instanceof Element)) return;

  const attribs: Record<string, string> = {};
  for (const { nodeName, nodeValue } of Array.from(node.attributes)) attribs[nodeName] = nodeValue ?? '';

  window.api
    .invoke(appEventList.rotomecaContextMenu, {
      target: { content: node.outerHTML, nodeName: node.nodeName, attribs, classes: Array.from(node.classList) },
      button: event.button,
      x: event.x,
      y: event.y,
    })
    .catch(console.error);
});
