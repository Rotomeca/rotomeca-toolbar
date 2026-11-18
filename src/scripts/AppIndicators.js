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

const MEDIA_ACTIONS = Object.freeze([
	'play',
	'pause',
	'previoustrack',
	'nexttrack',
]);
const MAX_TEXT_LENGTH = 200;
const MAX_DATA_URL_LENGTH = 500000;

/**
 * Valide l'état média envoyé par une page (donnée non fiable).
 * @param {*} raw JSON (chaîne) issu du script injecté dans le site
 * @returns {?{duration: ?number, position: ?number, title: string, artist: string, artwork: ?string, playing: boolean, actions: string[]}}
 *          `null` si la page n'expose aucun morceau
 */
function sanitizeMediaState(raw) {
	let data;
	try {
		data = typeof raw === 'string' ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}

	if (!data || typeof data !== 'object' || typeof data.title !== 'string')
		return null;

	const text = value =>
		typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '';

	const artwork =
		typeof data.artwork === 'string' &&
		(/^https:\/\//.test(data.artwork) ||
			(/^data:image\//.test(data.artwork) &&
				data.artwork.length <= MAX_DATA_URL_LENGTH))
			? data.artwork
			: null;

	const duration = Number.isFinite(data.duration) ? data.duration : 0;
	const position = Number.isFinite(data.position) ? data.position : 0;

	return {
		duration: duration > 0 ? duration : null,
		position: duration > 0 ? Math.min(Math.max(position, 0), duration) : null,
		title: text(data.title),
		artist: text(data.artist),
		artwork,
		playing: data.playing === true,
		actions: Array.isArray(data.actions)
			? data.actions.filter(x => MEDIA_ACTIONS.includes(x))
			: [],
	};
}

module.exports = { parseUnreadCount, sanitizeMediaState, MEDIA_ACTIONS };
