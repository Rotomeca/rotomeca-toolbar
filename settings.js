class Settings {
  #_settings;
  constructor() {}

  get #_config() {
    if (!this.#_settings) {
      const fs = require('fs');
      try {
        this.#_settings =
          fs.readFileSync('settings.rcft')?.toString?.() ?? '{}';
        this.#_settings = JSON.parse(this.#_settings);
      } catch (error) {
        this.#_settings = {};
      }
    }

    return this.#_settings;
  }

  get isButtonModeEnabled() {
    return this.#_config.isButtonModeEnabled ?? true;
  }

  set isButtonModeEnabled(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.isButtonModeEnabled = value;
  }

  get theme() {
    return this.#_config.theme ?? 'system';
  }

  set theme(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.theme = value;
  }

  save() {
    const fs = require('fs');
    fs.writeFileSync(
      'settings.rcft',
      JSON.stringify({
        isButtonModeEnabled: this.isButtonModeEnabled,
        theme: this.theme,
      }),
    );
  }
}

let _instance = null;
/**
 * @type {{Instance:Settings}}
 */
const Params = {};

Object.defineProperty(Params, 'Instance', {
  get: () => {
    if (!_instance) _instance = new Settings();

    return _instance;
  },
});

module.exports = { Params };
