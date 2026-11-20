const test = require('node:test');
const assert = require('node:assert/strict');
const {
  indexOfApp, savedUrls, collapseSeparators, removeApp, moveApp, insertSeparatorAfter, replaceApp,
} = require('../dist/src/main/apps/appList.js');

const app = (url) => ({ name: url, url, picture: null });
const S = 'separator';
const urls = (list) => list.map((e) => (e === S ? '-' : e.url)).join(' ');

test('indexOfApp : trouve une application, ignore les séparateurs', () => {
  assert.equal(indexOfApp([S, app('a'), app('b')], 'b'), 2);
  assert.equal(indexOfApp([S, app('a')], 'z'), -1);
});

test('savedUrls : ne garde que les objets', () => {
  assert.deepEqual(savedUrls([app('a'), S, null, 3, app('b')]), ['a', 'b']);
});

test('collapseSeparators : fusionne les séparateurs consécutifs', () => {
  const { list, removedSeparators } = collapseSeparators([app('a'), S, S, S, app('b')], { dropLeading: false });
  assert.equal(urls(list), 'a - b');
  assert.deepEqual(removedSeparators, ['a', 'a']);
});

test('collapseSeparators : retire le séparateur de tête sur demande', () => {
  const { list, removedSeparators } = collapseSeparators([S, app('a')], { dropLeading: true });
  assert.equal(urls(list), 'a');
  assert.deepEqual(removedSeparators, [0]);
  assert.equal(urls(collapseSeparators([S, app('a')], { dropLeading: false }).list), '- a');
});

test('collapseSeparators : ne modifie pas la liste donnée', () => {
  const input = [app('a'), S, S];
  collapseSeparators(input, { dropLeading: true });
  assert.equal(input.length, 3);
});

test('removeApp : retire l\'application et fusionne les séparateurs voisins', () => {
  const { list, removedSeparators } = removeApp([app('a'), S, app('b'), S, app('c')], 'b');
  assert.equal(urls(list), 'a - c');
  assert.deepEqual(removedSeparators, ['a']);
});

test('removeApp : adresse inconnue, liste inchangée', () => {
  assert.equal(urls(removeApp([app('a'), S], 'z').list), 'a -');
});

test('moveApp : descend d\'un cran', () => {
  const r = moveApp([app('a'), app('b'), app('c')], 'a', 'down');
  assert.equal(urls(r.list), 'b a c');
  assert.equal(r.modifier, 0);
});

test('moveApp : monte d\'un cran', () => {
  assert.equal(urls(moveApp([app('a'), app('b'), app('c')], 'c', 'up').list), 'a c b');
});

test('moveApp : enjambe un séparateur', () => {
  const r = moveApp([app('a'), S, app('b')], 'a', 'down');
  assert.equal(r.modifier, 1);
  assert.equal(urls(r.list), 'b a');
});

test('moveApp : null pour une adresse inconnue', () => {
  assert.equal(moveApp([app('a')], 'z', 'up'), null);
});

/** Copie de l'ancien algorithme de AppMain.event_request_movement (référence). */
function referenceMove(saves, url, type) {
  saves = [...saves];
  const index = saves.findIndex((x) => x.url === url);
  if (index < 0) return null;
  const element = saves.splice(index, 1)[0];
  let modifier = 0;
  while (saves[type === 'up' ? index - modifier : index + modifier] === 'separator') ++modifier;
  saves.splice(type === 'up' ? index - (1 + modifier) : index + (1 + modifier), 0, element);
  const tmp = [];
  const deleted = [];
  let corrector = 0;
  for (let i = 0, len = saves.length; i < len; ++i) {
    const item = saves[i];
    if (i === 0 && item === 'separator') { deleted.push(0); continue; }
    if (i + 1 < len && item === 'separator' && saves[i + 1] === 'separator') {
      deleted.push(saves[i - (1 + corrector)]?.url);
      ++corrector;
      continue;
    }
    corrector = 0;
    tmp.push(item);
  }
  return { list: tmp, removedSeparators: deleted, modifier };
}

test('moveApp : même résultat que l\'ancien algorithme sur toutes les listes de 5 éléments', () => {
  const kinds = ['a', 'b', 'c', S];
  let compared = 0;
  const build = (n, prefix) => {
    if (prefix.length === n) {
      const names = new Set();
      const list = prefix.map((k, i) => (k === S ? S : (names.add(k + i), app(k + i))));
      for (const entry of list) {
        if (entry === S) continue;
        for (const dir of ['up', 'down']) {
          const expected = referenceMove(list, entry.url, dir);
          const actual = moveApp(list, entry.url, dir);
          assert.deepEqual(actual.list, expected.list, `${urls(list)} ${entry.url} ${dir}`);
          assert.deepEqual([...actual.removedSeparators], expected.removedSeparators);
          assert.equal(actual.modifier, expected.modifier);
          ++compared;
        }
      }
      return;
    }
    for (const k of kinds) build(n, [...prefix, k]);
  };
  build(5, []);
  assert.ok(compared > 1000);
});

test('insertSeparatorAfter : en fin de liste, ajoute', () => {
  const r = insertSeparatorAfter([app('a'), app('b')], 'b');
  assert.equal(r.kind, 'appended');
  assert.equal(urls(r.list), 'a b -');
});

test('insertSeparatorAfter : au milieu, insère après l\'application', () => {
  const r = insertSeparatorAfter([app('a'), app('b')], 'a');
  assert.deepEqual([r.kind, r.index], ['inserted', 0]);
  assert.equal(urls(r.list), 'a - b');
});

test('insertSeparatorAfter : null si absente', () => {
  assert.equal(insertSeparatorAfter([app('a')], 'z'), null);
});

test('replaceApp : remplace l\'application et donne l\'ancienne adresse', () => {
  const r = replaceApp([app('a'), app('b')], 1, { name: 'N', url: 'u', picture: 'font:x' });
  assert.equal(r.oldLink, 'b');
  assert.deepEqual(r.list[1], { name: 'N', url: 'u', picture: 'font:x' });
});

test('replaceApp : refuse un séparateur, une position invalide ou non entière', () => {
  const data = app('n');
  assert.equal(replaceApp([S], 0, data), null);
  assert.equal(replaceApp([app('a')], 5, data), null);
  assert.equal(replaceApp([app('a')], '0', data), null);
  assert.equal(replaceApp([app('a')], 0.5, data), null);
});
