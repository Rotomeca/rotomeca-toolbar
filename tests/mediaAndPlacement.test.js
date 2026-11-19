const test = require('node:test');
const assert = require('node:assert/strict');
const { mediaProgress, mediaPayload } = require('../dist/src/main/media/mediaState.js');
const { centeredTop } = require('../dist/src/main/windows/placement.js');

// #region mediaProgress

test('mediaProgress : avancée entre 0 et 1', () => {
  assert.equal(mediaProgress({ duration: 200, position: 50 }), 0.25);
  assert.equal(mediaProgress({ duration: 200, position: 0 }), 0);
  assert.equal(mediaProgress({ duration: 200, position: 200 }), 1);
});

test('mediaProgress : null quand la durée est inconnue ou qu\'il n\'y a pas de morceau', () => {
  assert.equal(mediaProgress({ duration: null, position: null }), null);
  assert.equal(mediaProgress({ duration: 0, position: 0 }), null);
  assert.equal(mediaProgress(null), null);
  assert.equal(mediaProgress(undefined), null);
});

// #endregion

// #region mediaPayload

const song = { duration: 100, position: 10, title: 'T', artist: 'A', artwork: null, playing: true, actions: ['play'] };

test('mediaPayload : ajoute l\'adresse et l\'état muet au morceau', () => {
  assert.deepEqual(mediaPayload('https://music.test', song, true), { url: 'https://music.test', ...song, muted: true });
  assert.equal(mediaPayload('https://music.test', song, false).muted, false);
});

test('mediaPayload : null sans morceau', () => {
  assert.equal(mediaPayload('https://music.test', null, false), null);
  assert.equal(mediaPayload('https://music.test', undefined, false), null);
});

// #endregion

// #region centeredTop

const area = { y: 0, height: 1000 };

test('centeredTop : centre la fenêtre sur l\'ordonnée donnée', () => {
  assert.equal(centeredTop(500, 200, area), 400);
  assert.equal(centeredTop(500, 48, area), 476);
});

test('centeredTop : ne sort pas par le haut de la zone de travail', () => {
  assert.equal(centeredTop(10, 200, area), 0);
  assert.equal(centeredTop(10, 200, { y: 40, height: 960 }), 40);
});

test('centeredTop : ne sort pas par le bas de la zone de travail', () => {
  assert.equal(centeredTop(990, 200, area), 800);
  assert.equal(centeredTop(5000, 200, area), 800);
});

test('centeredTop : zone de travail décalée (écran secondaire, barre des tâches en haut)', () => {
  const secondary = { y: -1080, height: 1040 };
  assert.equal(centeredTop(-540, 200, secondary), -640);
  assert.equal(centeredTop(-2000, 200, secondary), -1080);
  assert.equal(centeredTop(0, 200, secondary), -1080 + 1040 - 200);
});

// #endregion

// #region Infobulle de la zone de notification

const { splitTaskbarPlayers, changedIgnored, describeNowPlaying } = require('../dist/src/main/media/mediaState.js');
const tr = (key, vars = {}) => `${key}${vars.count !== undefined ? `:${vars.count}` : ''}`;

test('splitTaskbarPlayers : le premier est affiché, les autres ignorés', () => {
  assert.deepEqual({ ...splitTaskbarPlayers(['a', 'b', 'c']) }, { first: 'a', others: ['b', 'c'] });
  assert.equal(splitTaskbarPlayers([]).first, undefined);
});

test('changedIgnored : seulement les adresses dont l\'état change', () => {
  assert.deepEqual(changedIgnored(new Set(['a', 'b']), new Set(['b', 'c'])).sort(), ['a', 'c']);
  assert.deepEqual(changedIgnored(new Set(), new Set()), []);
});

test('describeNowPlaying : titre, artiste, avancement et lecteurs ignorés', () => {
  const media = { playing: true, title: 'T', artist: 'A', duration: 200, position: 50 };
  assert.equal(describeNowPlaying(media, 2, tr), '▶ T – A\n25 %\ntray.ignoredPlayers:2');
});

test('describeNowPlaying : en pause, sans artiste ni durée, sans ignoré', () => {
  const media = { playing: false, title: 'T', artist: '', duration: null, position: null };
  assert.equal(describeNowPlaying(media, 0, tr), '⏸ T');
});

// #endregion
