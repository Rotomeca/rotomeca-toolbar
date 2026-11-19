/**
 * Compare deux numéros de version (`1.2.3`, `v1.2`, ...).
 * @param {string} a
 * @param {string} b
 * @returns {number} > 0 si a est plus récente, < 0 si plus ancienne, 0 si égales
 */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.length, right.length); ++i) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

module.exports = { compareVersions };
