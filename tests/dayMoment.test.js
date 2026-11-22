const test = require('node:test');
const assert = require('node:assert/strict');
const { momentFor, nextMomentBoundary } = require('../dist/src/shared/dayMoment.js');

/** Date locale à l'heure donnée (le moment dépend de l'heure locale de la machine). */
const at = (hour, minute = 0, day = 15) => new Date(2026, 5, day, hour, minute);

test('momentFor : les frontières appartiennent au moment qui commence', () => {
  assert.equal(momentFor(at(5, 59)), 'nuit');
  assert.equal(momentFor(at(6, 0)), 'aube');
  assert.equal(momentFor(at(8, 59)), 'aube');
  assert.equal(momentFor(at(9, 0)), 'jour');
  assert.equal(momentFor(at(16, 59)), 'jour');
  assert.equal(momentFor(at(17, 0)), 'crepuscule');
  assert.equal(momentFor(at(18, 59)), 'crepuscule');
  assert.equal(momentFor(at(19, 0)), 'nuit');
  assert.equal(momentFor(at(0, 0)), 'nuit');
});

test('nextMomentBoundary : la prochaine frontière est strictement postérieure', () => {
  assert.deepEqual(nextMomentBoundary(at(6, 0)), at(9));
  assert.deepEqual(nextMomentBoundary(at(8, 59)), at(9));
  assert.deepEqual(nextMomentBoundary(at(12)), at(17));
  assert.deepEqual(nextMomentBoundary(at(17, 30)), at(19));
});

test('nextMomentBoundary : après 19 h, la frontière est 6 h le lendemain', () => {
  assert.deepEqual(nextMomentBoundary(at(19)), at(6, 0, 16));
  assert.deepEqual(nextMomentBoundary(at(23, 59)), at(6, 0, 16));
  assert.deepEqual(nextMomentBoundary(at(2)), at(6));
});

test('nextMomentBoundary : fin de mois', () => {
  assert.deepEqual(nextMomentBoundary(new Date(2026, 0, 31, 20)), new Date(2026, 1, 1, 6));
});
