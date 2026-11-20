const test = require('node:test');
const assert = require('node:assert/strict');
const { appEventList, pageEventList, internalChannels } = require('../dist/src/shared/ipc/events.js');
const { loadPreload, fakeElement } = require('./support/loadPreload.js');

test('preload : expose window.api sous le nom « api »', () => {
  const { exposed } = loadPreload();
  assert.equal(exposed.name, 'api');
  for (const member of ['locale', 't', 'invoke', 'on']) assert.ok(member in exposed.api, member);
});

test('preload : n\'expose rien d\'autre que ces quatre membres', () => {
  assert.deepEqual(Object.keys(loadPreload().api).sort(), ['invoke', 'locale', 'on', 't']);
});

test('preload : demande les traductions au processus principal et en tire la langue', () => {
  const { api, calls } = loadPreload({ translations: { locale: 'fr', dict: {} } });
  assert.deepEqual(calls.sendSync, [internalChannels.i18n]);
  assert.equal(api.locale, 'fr');
});

test('preload : sans réponse du processus principal, langue anglaise et clés telles quelles', () => {
  const { api } = loadPreload({ translationsFail: true });
  assert.equal(api.locale, 'en');
  assert.equal(api.t('une.clef'), 'une.clef');
});

// #region invoke : liste blanche

test('invoke : tous les canaux de appEventList sont transmis avec leurs arguments', async () => {
  const { api, calls } = loadPreload();

  for (const channel of Object.values(appEventList)) {
    assert.equal(await api.invoke(channel, 'a', 2), `réponse de ${channel}`);
  }
  assert.equal(calls.invoke.length, Object.values(appEventList).length);
  assert.deepEqual(calls.invoke[0], [Object.values(appEventList)[0], 'a', 2]);
});

test('invoke : un canal inconnu est refusé par une promesse rejetée, sans appeler le système', async () => {
  const { api, calls } = loadPreload();

  await assert.rejects(api.invoke('canal.inconnu'), /non autorisé/);
  await assert.rejects(api.invoke(''), /non autorisé/);
  await assert.rejects(api.invoke(undefined), /non autorisé/);
  assert.deepEqual(calls.invoke, []);
});

test('invoke : les canaux d\'envoi et les canaux internes ne sont pas appelables par une page', async () => {
  const { api, calls } = loadPreload();

  for (const channel of [...Object.values(pageEventList), ...Object.values(internalChannels)]) {
    await assert.rejects(api.invoke(channel), /non autorisé/, channel);
  }
  assert.deepEqual(calls.invoke, []);
});

test('invoke : le nom d\'un canal ne se contourne pas par les propriétés héritées', async () => {
  const { api, calls } = loadPreload();

  for (const channel of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    await assert.rejects(api.invoke(channel), /non autorisé/, channel);
  }
  assert.deepEqual(calls.invoke, []);
});

// #endregion

// #region on : liste blanche

test('on : écoute chaque canal de pageEventList et ne transmet jamais l\'évènement IPC', () => {
  const { api, calls } = loadPreload();

  for (const channel of Object.values(pageEventList)) {
    const received = [];
    api.on(channel, (...args) => received.push(args));

    const [registeredChannel, listener] = calls.on.at(-1);
    assert.equal(registeredChannel, channel);

    listener({ sender: 'évènement IPC secret' }, 'donnée', 42);
    assert.deepEqual(received, [[null, 'donnée', 42]], channel);
  }
});

test('on : la fonction renvoyée retire exactement l\'écouteur enregistré', () => {
  const { api, calls } = loadPreload();

  const unsubscribe = api.on(pageEventList.appAdded, () => {});
  unsubscribe();

  assert.equal(calls.removed.length, 1);
  assert.equal(calls.removed[0][0], pageEventList.appAdded);
  assert.equal(calls.removed[0][1], calls.on[0][1]);
});

test('on : un canal non autorisé n\'enregistre rien et renvoie une fonction inoffensive', () => {
  const { api, calls } = loadPreload();

  for (const channel of ['canal.inconnu', ...Object.values(appEventList).filter((c) => !Object.values(pageEventList).includes(c)), ...Object.values(internalChannels)]) {
    const unsubscribe = api.on(channel, () => {});
    assert.equal(typeof unsubscribe, 'function', channel);
    unsubscribe();
  }
  assert.deepEqual(calls.on, []);
  assert.deepEqual(calls.removed, []);
});

test('on : un rappel qui n\'est pas une fonction est ignoré', () => {
  const { api, calls } = loadPreload();

  for (const callback of [null, undefined, 'texte', {}]) {
    assert.equal(typeof api.on(pageEventList.appAdded, callback), 'function');
  }
  assert.deepEqual(calls.on, []);
});

// #endregion

// #region t : traductions

test('t : traduit avec le dictionnaire et remplace les {variables}', () => {
  const { api } = loadPreload({ translations: { locale: 'fr', dict: { 'salut': 'Bonjour {nom}, {n} message(s)' } } });
  assert.equal(api.t('salut', { nom: 'Ana', n: 3 }), 'Bonjour Ana, 3 message(s)');
});

test('t : une clé inconnue est renvoyée telle quelle, un {nom} sans valeur reste visible', () => {
  const { api } = loadPreload({ translations: { locale: 'fr', dict: { 'salut': 'Bonjour {nom}' } } });
  assert.equal(api.t('inconnue'), 'inconnue');
  assert.equal(api.t('salut'), 'Bonjour {nom}');
});

test('t : {constructor} n\'est jamais remplacé par du code', () => {
  const { api } = loadPreload();
  assert.equal(api.t('a {constructor} b'), 'a {constructor} b');
});

// #endregion

// #region Traduction de la page

test('page : traduit le texte (data-i18n) et les attributs (data-i18n-*) des nouveaux éléments', () => {
  const { addNodes } = loadPreload({ translations: { locale: 'fr', dict: { 'titre': 'Paramètres', 'aide': 'Texte d\'aide' } } });
  const element = fakeElement({ 'data-i18n': 'titre', 'data-i18n-title': 'aide', 'class': 'x' });

  addNodes(element);

  assert.equal(element.textContent, 'Paramètres');
  assert.equal(element.attributes.title, 'Texte d\'aide');
  assert.equal(element.attributes.class, 'x');
});

test('page : traduit aussi les descendants des éléments ajoutés', () => {
  const { addNodes } = loadPreload({ translations: { locale: 'fr', dict: { 'enfant': 'Texte enfant' } } });
  const child = fakeElement({ 'data-i18n': 'enfant' });
  const parent = fakeElement({}, [child]);

  addNodes(parent);

  assert.equal(child.textContent, 'Texte enfant');
});

test('page : ignore les nœuds qui ne sont pas des éléments', () => {
  const { addNodes } = loadPreload({ translations: { locale: 'fr', dict: { 'x': 'y' } } });
  const text = { nodeType: 3, textContent: 'inchangé' };

  addNodes(text);

  assert.equal(text.textContent, 'inchangé');
});

test('page : pose la langue sur <html> et observe le document entier', () => {
  const { documentElement, calls, addNodes } = loadPreload({ translations: { locale: 'fr', dict: {} } });

  addNodes();
  assert.equal(documentElement.lang, 'fr');
  // Copie : l'objet vient du contexte du faux navigateur, dont le prototype diffère
  assert.deepEqual({ ...calls.observed[0].options }, { childList: true, subtree: true });
});

test('page : retraduit tout le document au chargement', () => {
  const { calls, documentElement } = loadPreload({ translations: { locale: 'fr', dict: { 'x': 'traduit' } } });
  const root = Object.assign(documentElement, fakeElement({ 'data-i18n': 'x' }));

  calls.windowListeners.DOMContentLoaded();

  assert.equal(root.textContent, 'traduit');
  assert.equal(documentElement.lang, 'fr');
});

// #endregion
