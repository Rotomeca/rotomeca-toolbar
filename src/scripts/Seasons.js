/**
 * Saisons : dates officielles des équinoxes et des solstices, et thème de saison du jour.
 *
 * Algorithme de Jean Meeus (Astronomical Algorithms, chap. 27), avec les 24 termes
 * périodiques : précis à quelques minutes sur 1000–3000, assez pour décider du jour
 * calendaire. Les dates sont ramenées au jour civil Europe/Paris.
 */

const TIME_ZONE = 'Europe/Paris';

/** Écart TT − UT (secondes), approché pour les années courantes */
const DELTA_T = 69;

/** Polynômes des instants moyens (jour julien) : mars, juin, septembre, décembre */
const MEAN = [
  [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
];

/** Termes périodiques [A, B (°), C (°/siècle)] */
const TERMS = [
  [485, 324.96, 1934.136],
  [203, 337.23, 32964.467],
  [199, 342.08, 20.186],
  [182, 27.85, 445267.112],
  [156, 73.14, 45036.886],
  [136, 171.52, 22518.443],
  [77, 222.54, 65928.934],
  [74, 296.72, 3034.906],
  [70, 243.58, 9037.513],
  [58, 119.81, 33718.147],
  [52, 297.17, 150.678],
  [50, 21.02, 2281.226],
  [45, 247.54, 29929.562],
  [44, 325.15, 31555.956],
  [29, 60.93, 4443.417],
  [18, 155.12, 67555.328],
  [17, 288.79, 4562.452],
  [16, 198.04, 62894.029],
  [14, 199.76, 31436.921],
  [12, 95.39, 14577.848],
  [12, 287.11, 31931.756],
  [12, 320.81, 34777.259],
  [9, 227.73, 1222.114],
  [8, 15.45, 16859.074],
];

const RAD = Math.PI / 180;

const parisDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * @param {Date} date
 * @returns {string} Jour civil Europe/Paris au format AAAA-MM-JJ (comparable comme texte)
 */
function parisDay(date) {
  return parisDayFormat.format(date);
}

/**
 * Instant (Date) d'un équinoxe ou d'un solstice.
 * @param {number} year
 * @param {0|1|2|3} index 0 équinoxe de mars, 1 solstice de juin, 2 équinoxe de septembre, 3 solstice de décembre
 * @returns {Date}
 */
function seasonInstant(year, index) {
  const y = (year - 2000) / 1000;
  const [a, b, c, d, e] = MEAN[index];
  const jde0 = a + b * y + c * y ** 2 + d * y ** 3 + e * y ** 4;

  const t = (jde0 - 2451545.0) / 36525;
  const w = (35999.373 * t - 2.47) * RAD;
  const lambda = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
  const s = TERMS.reduce(
    (sum, [amp, phase, speed]) => sum + amp * Math.cos((phase + speed * t) * RAD),
    0,
  );
  const jde = jde0 + (0.00001 * s) / lambda;

  return new Date((jde - 2440587.5) * 86400000 - DELTA_T * 1000);
}

/**
 * Jours civils (Europe/Paris) des équinoxes et solstices d'une année.
 * @param {number} year
 * @returns {{mars: string, juin: string, septembre: string, decembre: string}}
 */
function seasonDates(year) {
  const [mars, juin, septembre, decembre] = [0, 1, 2, 3].map((index) =>
    parisDay(seasonInstant(year, index)),
  );

  return { mars, juin, septembre, decembre };
}

/**
 * Début de chaque période de thème pour une année : [jour, thème].
 * Noël (24 et 25 décembre) est prioritaire, l'hiver reprend le 26.
 */
function boundsOf(year) {
  const d = seasonDates(year);

  return [
    [d.mars, 'cerisier'],
    [`${year}-04-01`, 'printemps'],
    [d.juin, 'ete'],
    [d.septembre, 'automne'],
    [d.decembre, 'hiver'],
    [`${year}-12-24`, 'noel'],
    [`${year}-12-26`, 'hiver'],
  ];
}

/**
 * Thème de saison d'un jour, et prochain changement.
 * @param {Date} [date]
 * @returns {{theme: string, nextTheme: string, nextDate: string}} `nextDate` au format AAAA-MM-JJ
 */
function seasonInfo(date = new Date()) {
  const today = parisDay(date);
  const year = Number(today.slice(0, 4));

  const bounds = [year - 1, year, year + 1]
    .flatMap(boundsOf)
    .sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));

  let current = 0;
  bounds.forEach(([day], i) => {
    if (day <= today) current = i;
  });

  return {
    theme: bounds[current][1],
    nextTheme: bounds[current + 1][1],
    nextDate: bounds[current + 1][0],
  };
}

/**
 * @param {Date} [date]
 * @returns {string} Thème de saison du jour
 */
function seasonThemeFor(date = new Date()) {
  return seasonInfo(date).theme;
}

module.exports = { seasonDates, seasonInfo, seasonThemeFor, parisDay };
