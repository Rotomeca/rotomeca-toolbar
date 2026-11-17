/**
 * Extrait le nombre de notifications non lues d'un titre de page, selon la
 * convention utilisée par la plupart des webapps : `(3) Boîte de réception`,
 * `[3] Chat` ou `(99+) Messages`.
 * @param {string} title Titre de la page
 * @returns {number} Nombre de non-lus (0 si aucun)
 */
function parseUnreadCount(title) {
  const match = /^\s*[([](\d{1,4})\+?[)\]]/.exec(title ?? '');

  return match ? parseInt(match[1], 10) : 0;
}

module.exports = { parseUnreadCount };
