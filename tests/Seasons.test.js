const test = require('node:test');
const assert = require('node:assert/strict');
const { seasonDates, seasonInfo, seasonThemeFor, parisDay } = require('../dist/src/scripts/Seasons.js');

/** Midi UTC : assez loin de minuit pour ne pas dépendre du fuseau. */
const noon = (day) => new Date(`${day}T12:00:00Z`);

test('seasonDates : équinoxes et solstices officiels (jour civil Europe/Paris)', () => {
  assert.deepEqual(seasonDates(2024), { mars: '2024-03-20', juin: '2024-06-20', septembre: '2024-09-22', decembre: '2024-12-21' });
  assert.deepEqual(seasonDates(2025), { mars: '2025-03-20', juin: '2025-06-21', septembre: '2025-09-22', decembre: '2025-12-21' });
  assert.deepEqual(seasonDates(2026), { mars: '2026-03-20', juin: '2026-06-21', septembre: '2026-09-23', decembre: '2026-12-21' });
});

test('seasonDates : le solstice de décembre 2027 tombe le 22 à Paris (2 h 42 UTC)', () => {
  assert.equal(seasonDates(2027).decembre, '2027-12-22');
});

test('parisDay : jour civil à Paris, pas en UTC', () => {
  // 23 h UTC le 30 juin : il est déjà le 1er juillet à Paris (heure d'été)
  assert.equal(parisDay(new Date('2026-06-30T23:00:00Z')), '2026-07-01');
  assert.equal(parisDay(new Date('2026-06-30T21:00:00Z')), '2026-06-30');
});

test('seasonInfo : hiver jusqu\'à l\'équinoxe de mars, puis cerisier', () => {
  assert.deepEqual(seasonInfo(noon('2026-03-19')), { theme: 'hiver', nextTheme: 'cerisier', nextDate: '2026-03-20' });
  assert.deepEqual(seasonInfo(noon('2026-03-20')), { theme: 'cerisier', nextTheme: 'printemps', nextDate: '2026-04-01' });
});

test('seasonInfo : le cerisier dure jusqu\'au 31 mars, puis printemps', () => {
  assert.equal(seasonThemeFor(noon('2026-03-31')), 'cerisier');
  assert.deepEqual(seasonInfo(noon('2026-04-01')), { theme: 'printemps', nextTheme: 'ete', nextDate: '2026-06-21' });
});

test('seasonInfo : été, puis automne à l\'équinoxe de septembre', () => {
  assert.equal(seasonThemeFor(noon('2026-07-15')), 'ete');
  assert.equal(seasonThemeFor(noon('2026-09-22')), 'ete');
  assert.deepEqual(seasonInfo(noon('2026-09-23')), { theme: 'automne', nextTheme: 'hiver', nextDate: '2026-12-21' });
});

test('seasonInfo : hiver au solstice, Noël les 24 et 25, hiver dès le 26', () => {
  assert.deepEqual(seasonInfo(noon('2026-12-21')), { theme: 'hiver', nextTheme: 'noel', nextDate: '2026-12-24' });
  assert.deepEqual(seasonInfo(noon('2026-12-24')), { theme: 'noel', nextTheme: 'hiver', nextDate: '2026-12-26' });
  assert.equal(seasonThemeFor(noon('2026-12-25')), 'noel');
  assert.equal(seasonThemeFor(noon('2026-12-26')), 'hiver');
});

test('seasonInfo : à la fin de l\'année, le prochain changement est en mars de l\'année suivante', () => {
  assert.deepEqual(seasonInfo(noon('2026-12-31')), { theme: 'hiver', nextTheme: 'cerisier', nextDate: '2027-03-20' });
  assert.deepEqual(seasonInfo(noon('2027-01-01')), { theme: 'hiver', nextTheme: 'cerisier', nextDate: '2027-03-20' });
});

test('seasonInfo : sans argument, utilise la date du jour', () => {
  const info = seasonInfo();
  assert.ok(['cerisier', 'printemps', 'ete', 'automne', 'hiver', 'noel'].includes(info.theme));
  assert.match(info.nextDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(info.nextDate > parisDay(new Date()));
});

test('seasonInfo : chaque jour de plusieurs années donne un thème valide et un changement futur', () => {
  const themes = new Set(['cerisier', 'printemps', 'ete', 'automne', 'hiver', 'noel']);
  for (let day = Date.UTC(2025, 0, 1); day < Date.UTC(2029, 0, 1); day += 24 * 3600 * 1000) {
    const date = new Date(day);
    const info = seasonInfo(date);
    assert.ok(themes.has(info.theme) && themes.has(info.nextTheme), date.toISOString());
    assert.ok(info.nextDate > parisDay(date), `${date.toISOString()} : ${info.nextDate}`);
    assert.notEqual(info.theme, info.nextTheme, date.toISOString());
  }
});
