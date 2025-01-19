const {
  JsEvent,
} = require('../../lib/RotomecaWebComponents/libs/events_electron');

var loadedModules = {};

class FileData {
  static #_basePath;
  #_name;
  constructor(name) {
    this.#_name = name;
    this.onsave = new JsEvent();
    this.onload = new JsEvent();
  }

  /**
   * @type {string}
   * @readonly
   */
  get path() {
    return `${FileData.BasePath}\\${this.#_name}`;
  }

  save(data) {
    this.#_tryCreateBaseFolder();

    FileData.fs.writeFileSync(this.path, JSON.stringify(data));

    this.onsave.call(data);

    return this;
  }

  load() {
    let data = null;
    try {
      data = JSON.parse(FileData.fs.readFileSync(this.path).toString());

      this.onload.call(data);
    } catch (error) {
      data = false;
    }

    return data;
  }

  async loadAsync() {
    let loaded = false;
    await new Promise((ok, nok) => {
      FileData.fs.readFile(this.path, 'utf-8', (err, data) => {
        if (!err) {
          try {
            loaded = JSON.parse(data.toString());
          } catch (error) {
            loaded = false;
          }
        }

        ok();
      });
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
    if (!this.#_basePath) {
      let path = '';
      if (process.platform === 'win32') {
        //Vérification si AppData/Roaming existe
        const roaming = `${FileData.os.homedir()}\\AppData\\Roaming`;
        if (fs.existsSync(roaming)) path = roaming;
        else path = FileData.os.homedir();
      } else path = FileData.os.homedir();

      this.#_basePath = `${path}\\.rotomeca-toolbar-data`;
    }

    return this.#_basePath;
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

  static Save(filename, data) {
    return new FileData(filename).save(data);
  }

  /**
   *
   * @param {string} filename
   * @returns {Promise<{fileManipulator:FileData, data:false | any, loadSuccess:boolean}>}
   * @async
   * @static
   */
  static async Load(filename) {
    let saver = new FileData(filename);
    const data = await saver.load();

    return {
      data,
      fileManipulator: saver,
      loadSuccess: data !== false,
    };
  }
}

module.exports = { FileData };
