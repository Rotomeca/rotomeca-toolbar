const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PRELOAD = path.join(__dirname, '..', '..', 'dist', 'preload.js');

/**
 * Exécute le preload construit (`dist/preload.js`) avec un faux Electron et un faux navigateur,
 * comme le ferait une page : seul `require('electron')` est permis, comme dans un preload
 * sandboxé. Renvoie l'API exposée aux pages et ce que le preload a demandé au système.
 * @param {{translations?: object, translationsFail?: boolean}} [options]
 */
function loadPreload({ translations = { locale: 'fr', dict: {} }, translationsFail = false } = {}) {
  const calls = { sendSync: [], invoke: [], on: [], removed: [], windowListeners: {}, observed: [] };
  const state = { exposed: null, observerCallback: null };

  const ipcRenderer = {
    sendSync: (channel) => {
      calls.sendSync.push(channel);
      if (translationsFail) throw new Error('processus principal indisponible');
      return translations;
    },
    invoke: (channel, ...data) => {
      calls.invoke.push([channel, ...data]);
      return Promise.resolve(`réponse de ${channel}`);
    },
    on: (channel, listener) => calls.on.push([channel, listener]),
    removeListener: (channel, listener) => calls.removed.push([channel, listener]),
  };

  const contextBridge = {
    exposeInMainWorld: (name, api) => {
      state.exposed = { name, api };
    },
  };

  const documentElement = { lang: '' };
  const sandbox = {
    require: (name) => {
      if (name !== 'electron') throw new Error(`require interdit dans un preload sandboxé : ${name}`);
      return { contextBridge, ipcRenderer };
    },
    module: { exports: {} },
    exports: {},
    document: { documentElement },
    window: {
      addEventListener: (event, listener) => {
        calls.windowListeners[event] = listener;
      },
    },
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: class {
      constructor(callback) {
        state.observerCallback = callback;
      }

      observe(target, options) {
        calls.observed.push({ target, options });
      }
    },
    console,
  };

  vm.runInNewContext(fs.readFileSync(PRELOAD, 'utf8'), sandbox, { filename: PRELOAD });

  return {
    exposed: state.exposed,
    api: state.exposed?.api,
    calls,
    documentElement,
    /** Simule l'arrivée de nœuds dans la page (le preload les traduit). */
    addNodes: (...nodes) => state.observerCallback([{ addedNodes: nodes }]),
  };
}

/** Un faux élément du DOM, avec ses attributs, que le preload peut traduire. */
function fakeElement(attributes, children = []) {
  const element = {
    nodeType: 1,
    textContent: '',
    attributes: { ...attributes },
    getAttributeNames: () => Object.keys(element.attributes),
    getAttribute: (name) => element.attributes[name] ?? null,
    setAttribute: (name, value) => {
      element.attributes[name] = value;
    },
    querySelectorAll: () => children,
  };
  return element;
}

module.exports = { loadPreload, fakeElement };
