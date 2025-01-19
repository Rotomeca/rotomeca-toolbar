const {
  JsEvent,
} = require('../../lib/RotomecaWebComponents/libs/events_electron');

/**
 * Modules qui seront déchargés toute les 5 minutes pour libérer de la mémoire
 * @type {Object<string, any>}
 * @package
 */
var loadedModules = {};

/**
 * @callback OnItemSavedCallback
 * @param {any} data Données sauvegardés
 * @returns {void}
 */

/**
 * @callback OnItemLoadedCallback
 * @param {any | false} data Données chargés. `false` si le fichier n'existe pas.
 * @return {void}
 */

/**
 * @class
 * @classdesc Sauvegarde ou charge des données
 */
class FileData {
  static #_basePath;
  #_name;
  /**
   *
   * @param {string} name Nom du fichier avec son extention
   */
  constructor(name) {
    this.#_name = name;
    /**
     * Appelé lorsque des données sont sauvegardés
     * @type {JsEvent<OnItemSavedCallback>}
     * @event
     */
    this.onsave = new JsEvent();
    /**
     * Appelé lorsque des données sont sauvegardés
     * @type {JsEvent<OnItemLoadedCallback>}
     * @event
     */
    this.onload = new JsEvent();
  }

  /**
   * Chemin du fichier
   * @type {string}
   * @readonly
   */
  get path() {
    return `${FileData.BasePath}\\${this.#_name}`;
  }

  /**
   * Sauvegarde les données dans le fichier
   * @param {*} data Données à sauvegarder
   * @returns {FileData} Chaînage
   * @fires FileData.onsave
   */
  save(data) {
    this.#_tryCreateBaseFolder();

    FileData.fs.writeFileSync(this.path, JSON.stringify(data));

    this.onsave.call(data);

    return this;
  }

  /**
   * Charge les données
   * @returns {any | false} false si le fichier n'éxiste pas
   */
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

  /**
   * Charge les données
   * @returns {Promise<any | false>} false si le fichier n'éxiste pas
   * @async
   */
  async loadAsync() {
    let loaded = false;
    await new Promise((ok) => {
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
   * Chemin du "home" de l'utilisateur
   * @type {string}
   * @readonly
   * @static
   */
  static get BasePath() {
    if (!this.#_basePath) {
      let path = '';
      if (process.platform === 'win32') {
        //Vérification si AppData/Roaming existe
        const roaming = `${FileData.os.homedir()}\\AppData\\Roaming`;
        if (this.fs.existsSync(roaming)) path = roaming;
        else path = FileData.os.homedir();
      } else path = FileData.os.homedir();

      this.#_basePath = `${path}\\.rotomeca-toolbar-data`;
    }

    return this.#_basePath;
  }

  /**
   * @type {typeof os}
   * @readonly
   * @static
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
   * @static
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

  /**
   * Sauvegarde des données dans un fichier
   * @param {string} filename
   * @param {*} data
   * @returns {FileData}
   */
  static Save(filename, data) {
    return new FileData(filename).save(data);
  }

  /**
   * Charge les données d'un fichier
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
