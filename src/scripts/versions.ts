/**
 * Découpe un numéro de version (`1.2.3`, `v1.2`, `1.2.3-rc1`).
 * @param {unknown} value
 * @returns {{core: number[], pre: ?{label: string, number: number}}}
 */
function parse(value) {
  const text = String(value).replace(/^v/i, '');
  const dash = text.indexOf('-');
  const core = (dash < 0 ? text : text.slice(0, dash))
    .split('.')
    .map((n) => parseInt(n, 10) || 0);

  if (dash < 0) return { core, pre: null };

  // « rc1 » : une étiquette puis un numéro. Tout le reste compte comme étiquette seule.
  const match = /^([a-z]*)(\d*)$/i.exec(text.slice(dash + 1));
  return {
    core,
    pre: {
      label: (match ? match[1] : text.slice(dash + 1)).toLowerCase(),
      number: match ? parseInt(match[2], 10) || 0 : 0,
    },
  };
}

/**
 * Compare deux numéros de version. Une pré-version (`3.3.0-rc1`) est plus ancienne
 * que sa version finale (`3.3.0`), et plus récente que la précédente (`3.2.0`).
 * @param {string} a
 * @param {string} b
 * @returns {number} > 0 si a est plus récente, < 0 si plus ancienne, 0 si égales
 */
function compareVersions(a, b) {
  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.core.length, right.core.length); ++i) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (!left.pre && !right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;

  return (
    left.pre.label.localeCompare(right.pre.label) ||
    left.pre.number - right.pre.number
  );
}

/**
 * @param {string} version
 * @returns {boolean} true pour une pré-version (`3.4.0-rc1`), false pour une release (`3.4.0`)
 */
function isPrerelease(version) {
  return parse(version).pre !== null;
}

module.exports = { compareVersions, isPrerelease };
