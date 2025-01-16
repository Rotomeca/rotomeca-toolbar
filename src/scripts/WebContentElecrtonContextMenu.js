document.addEventListener('contextmenu', async (e) => {
  const { appEventList } = await import(
    '../scripts/events/AppEventListModule.js'
  );

  const node = e.target;
  let target = { content: node.outerHTML, nodeName: node.nodeName };

  target.attribs = {};

  for (let index = 0, len = node.attributes.length; index < len; ++index) {
    const element = node.attributes[index];
    target.attribs[element.nodeName] = element.nodeValue;
  }

  target.classes = [];
  for (const element of node.classList.values()) {
    target.classes.push(element);
  }

  window.api.invoke(appEventList.rotomecaContextMenu, {
    target,
    button: e.button,
    x: e.x,
    y: e.y,
  });
});
