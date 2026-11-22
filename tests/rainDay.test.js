const test = require('node:test');
const assert = require('node:assert/strict');
const { isRainyDay, canRain } = require('../dist/src/shared/rainDay.js');
const { RAIN_DAYS_PER_MONTH } = require('../dist/src/shared/rainFrequency.js');

test('isRainyDay : même date, même résultat, quelle que soit l\'heure', () => {
  const morning = new Date(2026, 4, 12, 7);
  const evening = new Date(2026, 4, 12, 22, 30);
  assert.equal(isRainyDay(morning), isRainyDay(evening));
  assert.equal(isRainyDay(morning), isRainyDay(new Date(2026, 4, 12, 7)));
});

test('isRainyDay : une table à zéro ne pleut jamais, une table au maximum pleut toujours', () => {
  const never = Array(12).fill(0);
  const always = Array(12).fill(31);
  for (let day = 1; day <= 28; day++) {
    assert.equal(isRainyDay(new Date(2026, 1, day), never), false);
    assert.equal(isRainyDay(new Date(2026, 1, day), always), true);
  }
});

test('isRainyDay : la proportion de jours de pluie de chaque mois est proche de la table', () => {
  const years = 200;

  for (let month = 0; month < 12; month++) {
    let rainy = 0;
    let days = 0;
    for (let year = 1900; year < 1900 + years; year++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        days++;
        if (isRainyDay(new Date(year, month, day))) rainy++;
      }
    }

    const expected = RAIN_DAYS_PER_MONTH[month] / 30.4;
    assert.ok(Math.abs(rainy / days - expected) < 0.025, `mois ${month + 1} : ${(rainy / days).toFixed(3)} pour ${expected.toFixed(3)}`);
  }
});

test('canRain : été, automne et printemps seulement', () => {
  for (const palette of ['ete', 'automne', 'printemps']) assert.equal(canRain(palette), true);
  for (const palette of ['hiver', 'noel', 'cerisier', 'sombre', '']) assert.equal(canRain(palette), false);
});
