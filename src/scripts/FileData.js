const {
  JsEvent,
} = require('../../lib/RotomecaWebComponents/libs/events_electron');

var loadedModules = {};

class FileData {
  #_name;
  constructor(name) {
    this.#_name = name;
    this.onsave = new JsEvent();
    this.onload = new JsEvent();
  }

  save(data) {
    this.#_tryCreateBaseFolder();

    FileData.fs.writeFileSync(
      `${FileData.BasePath}\\${this.#_name}`,
      JSON.stringify(data),
    );

    this.onsave.call(data);
  }

  async load() {
    let loaded = false;
    await new Promise((ok, nok) => {
      FileData.fs.readFile(
        `${FileData.BasePath}\\${this.#_name}`,
        'utf-8',
        (err, data) => {
          if (!err) {
            try {
              loaded = JSON.parse(data.toString());
            } catch (error) {
              loaded = false;
            }
          }

          ok();
        },
      );
    });

    if (loaded !== false) this.onload.call(loaded);

    return loaded;
  }

  #_tryCreateBaseFolder() {
    if (!FileData.fs.existsSync(FileData.BasePath)) {
      FileData.fs.mkdirSync(FileData.BasePath);
    }

    return this;
  }

  /**
   * @type {string}
   * @readonly
   */
  static get BasePath() {
    return `${FileData.os.homedir()}\\rotomeca-toolbar-data`;
  }

  /**
   * @type {typeof os}
   * @readonly
   */
  static get os() {
    if (!loadedModules.os) {
      loadedModules.os = require('os');
    }

    this.#_RemoveApp('os');

    return loadedModules.os;
  }

  /**
   * @type {typeof fs}
   * @readonly
   */
  static get fs() {
    if (!loadedModules.fs) {
      loadedModules.fs = require('fs');
    }

    this.#_RemoveApp('fs');

    return loadedModules.fs;
  }

  static #_RemoveApp(app) {
    if (loadedModules[`timeout_${app}`])
      clearTimeout(loadedModules[`timeout_${app}`]);

    loadedModules[`timeout_${app}`] = setTimeout(
      (app) => {
        delete loadedModules[app];
        delete loadedModules[`timeout_${app}`];
      },
      1000 * 60 * 5,
      app,
    );
  }
}

module.exports = { FileData };
