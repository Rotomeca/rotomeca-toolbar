const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUnreadCount, sanitizeMediaState, MEDIA_ACTIONS } = require('../dist/src/scripts/AppIndicators.js');

test('parseUnreadCount : les conventions courantes de titre', () => {
  assert.equal(parseUnreadCount('(3) Boîte de réception'), 3);
  assert.equal(parseUnreadCount('[3] Chat'), 3);
  assert.equal(parseUnreadCount('(99+) Messages'), 99);
  assert.equal(parseUnreadCount('  (12) avec espaces'), 12);
});

test('parseUnreadCount : 0 quand il n\'y a pas de compteur valide', () => {
  for (const title of ['Sans compteur', '', '(a) lettre', '(12345) trop long', '(3', '3) x', 'Titre (3)', null, undefined]) {
    assert.equal(parseUnreadCount(title), 0, String(title));
  }
});

const media = (data) => sanitizeMediaState(JSON.stringify(data));

test('sanitizeMediaState : un état complet valide est conservé', () => {
  assert.deepEqual(
    media({
      title: 'Titre',
      artist: 'Artiste',
      artwork: 'https://exemple.test/pochette.png',
      duration: 200,
      position: 50,
      playing: true,
      actions: ['play', 'pause'],
    }),
    {
      duration: 200,
      position: 50,
      title: 'Titre',
      artist: 'Artiste',
      artwork: 'https://exemple.test/pochette.png',
      playing: true,
      actions: ['play', 'pause'],
    },
  );
});

test('sanitizeMediaState : null quand la page n\'expose aucun morceau ou envoie n\'importe quoi', () => {
  for (const raw of [undefined, null, 5, {}, '', '{json invalide', 'null', '[]', '"texte"', '42']) {
    assert.equal(sanitizeMediaState(raw), null, String(raw));
  }
  for (const data of [{}, { title: 123 }, { artist: 'sans titre' }, null, [], 'texte']) {
    assert.equal(media(data), null, JSON.stringify(data));
  }
});

test('sanitizeMediaState : les textes sont tronqués à 200 caractères', () => {
  const state = media({ title: 'x'.repeat(300), artist: 'y'.repeat(300) });
  assert.equal(state.title.length, 200);
  assert.equal(state.artist.length, 200);
});

test('sanitizeMediaState : seule une pochette https ou une petite image intégrée est acceptée', () => {
  assert.equal(media({ title: 'T', artwork: 'https://x.test/a.png' }).artwork, 'https://x.test/a.png');
  assert.equal(media({ title: 'T', artwork: 'data:image/png;base64,AAAA' }).artwork, 'data:image/png;base64,AAAA');

  for (const artwork of [
    'http://x.test/a.png',
    'javascript:alert(1)',
    'file:///C:/secret.png',
    `data:image/png;base64,${'A'.repeat(500000)}`,
    'data:text/html,<script>',
    42,
    null,
  ]) {
    assert.equal(media({ title: 'T', artwork }).artwork, null, String(artwork).slice(0, 40));
  }
});

test('sanitizeMediaState : sans durée valide, la position est inconnue aussi', () => {
  for (const duration of [0, -5, 'abc', null]) {
    const state = media({ title: 'T', duration, position: 10 });
    assert.equal(state.duration, null, String(duration));
    assert.equal(state.position, null, String(duration));
  }
});

test('sanitizeMediaState : la position reste entre 0 et la durée', () => {
  assert.equal(media({ title: 'T', duration: 100, position: -3 }).position, 0);
  assert.equal(media({ title: 'T', duration: 100, position: 500 }).position, 100);
  assert.equal(media({ title: 'T', duration: 100, position: 42 }).position, 42);
  assert.equal(media({ title: 'T', duration: 100, position: 'x' }).position, 0);
});

test('sanitizeMediaState : playing n\'est vrai que pour le booléen true', () => {
  assert.equal(media({ title: 'T', playing: true }).playing, true);
  for (const playing of ['true', 1, null, 'oui']) {
    assert.equal(media({ title: 'T', playing }).playing, false, String(playing));
  }
});

test('sanitizeMediaState : seules les actions connues sont gardées', () => {
  assert.deepEqual(media({ title: 'T', actions: ['play', 'evil', 5, null, 'nexttrack'] }).actions, ['play', 'nexttrack']);
  assert.deepEqual(media({ title: 'T', actions: 'play' }).actions, []);
  assert.deepEqual(media({ title: 'T', actions: {} }).actions, []);
  assert.deepEqual(media({ title: 'T' }).actions, []);
});

test('MEDIA_ACTIONS : les quatre actions de lecture', () => {
  assert.deepEqual([...MEDIA_ACTIONS], ['play', 'pause', 'previoustrack', 'nexttrack']);
});
