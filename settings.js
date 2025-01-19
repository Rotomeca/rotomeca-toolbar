class Settings {
  #_settings;
  #_filedata;
  constructor() {}

  get #_config() {
    if (!this.#_settings) {
      try {
        this.#_settings = this.fileData.load() || {};
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

  /**
   * @type {readonly}
   */
  get filePath() {
    return this.fileData.path;
  }

  save() {
    this.fileData.save({
      isButtonModeEnabled: this.isButtonModeEnabled,
      theme: this.theme,
    });
  }

  /**
   * @type {FileData}
   * @readonly
   */
  get fileData() {
    if (!this.#_filedata) {
      const { FileData } = require('./src/scripts/FileData');
      this.#_filedata = new FileData('settings.rcft');
    }

    return this.#_filedata;
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
