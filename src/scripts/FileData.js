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
    return FileData.nodePath.join(FileData.BasePath, this.#_name);
  }

  /**
   * Sauvegarde les données dans le fichier
   * @param {*} data Données à sauvegarder
   * @returns {FileData} Chaînage
   * @fires FileData.onsave
   */
  save(data) {
    this.#_tryCreateBaseFolder();

    // Écriture atomique : fichier temporaire puis rename, avec copie .bak
    const target = this.path;
    const tmp = `${target}.tmp`;
    FileData.fs.writeFileSync(tmp, JSON.stringify(data));
    if (FileData.fs.existsSync(target)) {
      try {
        FileData.fs.copyFileSync(target, `${target}.bak`);
      } catch (error) {
        console.error('Impossible de créer la sauvegarde', error);
      }
    }
    FileData.fs.renameSync(tmp, target);

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
      this.#_quarantineIfCorrupt(error);
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
            this.#_quarantineIfCorrupt(error);
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
      FileData.fs.mkdirSync(FileData.BasePath, { recursive: true });
    }

    return this;
  }

  /**
   * Si le fichier existe mais est illisible (JSON invalide), on le renomme
   * pour qu'il ne soit jamais écrasé par la prochaine sauvegarde.
   * @param {Error} error
   */
  #_quarantineIfCorrupt(error) {
    if (error && error.code === 'ENOENT') return;
    try {
      if (FileData.fs.existsSync(this.path)) {
        FileData.fs.renameSync(this.path, `${this.path}.corrupt-${Date.now()}`);
      }
    } catch (e) {
      console.error('Impossible de mettre en quarantaine le fichier', e);
    }
  }

  /**
   * Chemin du "home" de l'utilisateur
   * @type {string}
   * @readonly
   * @static
   */
  static get BasePath() {
    if (!this.#_basePath) {
      let base = '';
      if (process.platform === 'win32') {
        //Vérification si AppData/Roaming existe
        const roaming = FileData.nodePath.join(
          FileData.os.homedir(),
          'AppData',
          'Roaming',
        );
        if (this.fs.existsSync(roaming)) base = roaming;
        else base = FileData.os.homedir();
      } else base = FileData.os.homedir();

      this.#_basePath = FileData.nodePath.join(base, '.rotomeca-toolbar-data');
    }

    return this.#_basePath;
  }

  /**
   * @type {typeof import('path')}
   * @readonly
   * @static
   */
  static get nodePath() {
    return require('path');
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
      (name) => {
        delete loadedModules[name];
        delete loadedModules[`timeout_${name}`];
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
