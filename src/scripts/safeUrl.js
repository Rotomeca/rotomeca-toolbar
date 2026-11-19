/**
 * Une URL est sûre si c'est une URL http(s) valide.
 * @param {unknown} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch (error) {
    return false;
  }
}

module.exports = { isSafeUrl };
