import '../scripts/ds.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

/**
 * @class
 * @classdesc Petit lecteur affiché au survol d'un bouton qui joue un morceau
 */
class Main {
	/**
	 * Dernier état reçu
	 * @type {?{url: string, title: string, artist: string, artwork: ?string, playing: boolean, actions: string[], muted: boolean}}
	 */
	#_state = null;

	constructor() {
		this.main();
	}

	main() {
		window.api.on(pageEventList.mediaState, (_, state) => this.render(state));

		// Garde la fenêtre ouverte tant que la souris est dessus
		document.addEventListener('mouseenter', () =>
			window.api.invoke(appEventList.mediaHover, {
				url: this.#_state?.url,
				hovering: true,
			}),
		);
		document.addEventListener('mouseleave', () =>
			window.api.invoke(appEventList.mediaHover, {
				url: this.#_state?.url,
				hovering: false,
			}),
		);

		this.bind('prev', () => this.control('previoustrack'));
		this.bind('next', () => this.control('nexttrack'));
		this.bind('toggle', () =>
			this.control(this.#_state?.playing ? 'pause' : 'play'),
		);
		this.bind('mute', () =>
			window.api.invoke(appEventList.toggleMute, { url: this.#_state?.url }),
		);
	}

	bind(id, callback) {
		document.getElementById(id).addEventListener('click', callback);
	}

	control(action) {
		if (this.#_state)
			window.api.invoke(appEventList.mediaControl, {
				url: this.#_state.url,
				action,
			});
	}

	render(state) {
		this.#_state = state;

		const cover = document.getElementById('cover');
		cover.hidden = !state.artwork;
		if (state.artwork) cover.src = state.artwork;
		else cover.removeAttribute('src');

		const title = document.getElementById('title');
		title.textContent = state.title;
		title.title = state.title;
		document.getElementById('artist').textContent = state.artist;

		const bar = document.getElementById('bar');
		bar.hidden = !state.duration;
		if (state.duration)
			bar.value = Math.round((state.position / state.duration) * 100);

		const has = action => state.actions.includes(action);
		document.getElementById('prev').disabled = !has('previoustrack');
		document.getElementById('next').disabled = !has('nexttrack');
		// Sans handler, le script injecté pilote directement les lecteurs audio/vidéo
		document
			.getElementById('toggle')
			.setAttribute('icon', state.playing ? 'pause' : 'play');

		const mute = document.getElementById('mute');
		const muteLabel = state.muted ? 'Réactiver le son' : 'Couper le son';
		mute.setAttribute('icon', state.muted ? 'volume-x' : 'volume-2');
		mute.setAttribute('label', muteLabel);
		mute.title = muteLabel;
	}
}

new Main();
