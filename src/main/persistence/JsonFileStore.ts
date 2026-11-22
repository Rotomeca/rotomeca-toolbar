/**
 * Fichier JSON sûr : écriture atomique, sauvegarde `.bak`, mise en quarantaine d'un fichier corrompu.
 *
 * Sert à stocker la liste des applications (`data.rsft`) et les décisions de permission (`permissions.rcft`),
 * créés dans `bootstrap.ts` et `App.ts`. Le système de fichiers est injectable pour les tests.
 */
// [node:fs] accès au système de fichiers (Node.js)
import fs from 'node:fs';
// [node:os] informations sur le système (Node.js)
import os from 'node:os';
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';

/** Ce que le magasin demande au système de fichiers : un sous-ensemble de `node:fs`, simple à simuler. */
export interface StoreFileSystem {
  /** Vrai si le fichier ou le dossier existe. */
  existsSync(path: string): boolean;
  /** Crée un dossier (et ses parents). */
  mkdirSync(path: string, options: { recursive: true }): unknown;
  /** Écrit un fichier texte. */
  writeFileSync(path: string, data: string): void;
  /** Copie un fichier. */
  copyFileSync(from: string, to: string): void;
  /** Renomme ou déplace un fichier. */
  renameSync(from: string, to: string): void;
  /** Lit un fichier de façon synchrone. */
  readFileSync(path: string): { toString(): string };
  /** Lit un fichier texte de façon asynchrone. */
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

/** Implémentation réelle, au-dessus de `node:fs`. */
const nodeFileSystem: StoreFileSystem = {
  existsSync: (target) => fs.existsSync(target),
  // Dossier et fichiers réservés à l'utilisateur (sans effet sous Windows, où les droits viennent du profil)
  mkdirSync: (target, options) => fs.mkdirSync(target, { ...options, mode: 0o700 }),
  // Forcé sur le disque avant le renommage : après une coupure de courant, le fichier est entier ou absent, jamais vide
  writeFileSync: (target, data) => {
    const descriptor = fs.openSync(target, 'w', 0o600);
    try {
      fs.writeSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  },
  copyFileSync: (from, to) => fs.copyFileSync(from, to),
  renameSync: (from, to) => fs.renameSync(from, to),
  readFileSync: (target) => fs.readFileSync(target),
  readFile: (target, encoding) => fs.promises.readFile(target, encoding),
};

/**
 * Dossier des données de l'application : `%APPDATA%` sous Windows s'il existe, sinon le dossier personnel.
 *
 * @param platform Plateforme ciblée.
 * @param homedir Dossier personnel de l'utilisateur.
 * @param fileSystem Sert à tester l'existence du dossier `AppData/Roaming`.
 * @returns Le chemin du dossier `.rotomeca-toolbar-data` (il n'est pas créé ici)
 */
export function dataDirectory(
  platform: NodeJS.Platform = process.platform,
  homedir: string = os.homedir(),
  fileSystem: Pick<StoreFileSystem, 'existsSync'> = nodeFileSystem,
): string {
  const roaming = path.join(homedir, 'AppData', 'Roaming');
  const base = platform === 'win32' && fileSystem.existsSync(roaming) ? roaming : homedir;

  return path.join(base, '.rotomeca-toolbar-data');
}


/**
 * Fichier JSON écrit de façon atomique (fichier temporaire puis renommage, copie `.bak`).
 * Un fichier au JSON invalide est mis de côté (`.corrupt-<date>`) pour ne jamais être écrasé.
 */
export class JsonFileStore {
  /** Chemin complet du fichier géré. */
  readonly path: string;
  private readonly directory: string;

  /**
   * @param directory Dossier du fichier (créé à la première écriture).
   * @param name Nom du fichier.
   * @param files Système de fichiers, remplaçable en test.
   * @param now Horloge en millisecondes, utilisée pour nommer les fichiers mis de côté.
   */
  constructor(
    directory: string,
    name: string,
    private readonly files: StoreFileSystem = nodeFileSystem,
    private readonly now: () => number = Date.now,
  ) {
    this.directory = directory;
    this.path = path.join(directory, name);
  }

  /**
   * Écrit les données ; crée le dossier si besoin. Le fichier précédent est copié en `.bak`.
   *
   * @param data Valeur sérialisable en JSON.
   */
  save(data: unknown): void {
    if (!this.files.existsSync(this.directory)) this.files.mkdirSync(this.directory, { recursive: true });

    const temporary = `${this.path}.tmp`;
    this.files.writeFileSync(temporary, JSON.stringify(data));
    this.backupExisting();
    this.files.renameSync(temporary, this.path);
  }

  /**
   * @returns Les données ; si le fichier est corrompu, celles de la sauvegarde `.bak` ; `false` si le fichier
   * est absent ou illisible (lecture synchrone)
   */
  load(): unknown {
    try {
      return JSON.parse(this.files.readFileSync(this.path).toString());
    } catch (error) {
      return this.recoverFrom(error);
    }
  }

  /** @returns Les données (ou celles de la sauvegarde `.bak` si le fichier est corrompu), ou `false` si le fichier est absent ou illisible */
  async loadAsync(): Promise<unknown> {
    try {
      return JSON.parse(await this.files.readFile(this.path, 'utf-8'));
    } catch (error) {
      return this.recoverFrom(error);
    }
  }

  /**
   * Garde une copie du fichier tel qu'il est (`<fichier>.<label>`), par exemple avant qu'une version réparée
   * ne le remplace. Une copie plus ancienne de même nom est remplacée ; sans fichier, rien n'est fait.
   *
   * @param label Suffixe de la copie (`invalid`)
   */
  keepCopy(label: string): void {
    if (this.files.existsSync(this.path)) this.files.copyFileSync(this.path, `${this.path}.${label}`);
  }

  /**
   * Après un échec de lecture : met de côté un fichier corrompu, puis lui substitue la sauvegarde `.bak`
   * si elle est lisible (la prochaine écriture la remettra en place).
   *
   * @param error Erreur de lecture
   * @returns Le contenu de la sauvegarde, ou `false`
   */
  private recoverFrom(error: unknown): unknown {
    this.quarantineIfCorrupt(error);
    if (!(error instanceof SyntaxError)) return false;

    try {
      return JSON.parse(this.files.readFileSync(`${this.path}.bak`).toString());
    } catch {
      // Pas de sauvegarde lisible : comme un fichier absent
      return false;
    }
  }

  /** Copie le fichier actuel en `.bak` avant qu'il soit remplacé ; un échec est journalisé sans bloquer l'écriture. */
  private backupExisting(): void {
    if (!this.files.existsSync(this.path)) return;

    try {
      this.files.copyFileSync(this.path, `${this.path}.bak`);
    } catch (error) {
      console.error('Impossible de créer la sauvegarde', error);
    }
  }

  /**
   * Met de côté un fichier dont le JSON est invalide, pour qu'une écriture ne l'écrase pas.
   *
   * @param error Erreur de lecture ; seule une `SyntaxError` déclenche la mise de côté.
   */
  private quarantineIfCorrupt(error: unknown): void {
    // Une erreur de lecture (fichier absent, verrouillé) ne prouve pas que le contenu est corrompu
    if (!(error instanceof SyntaxError)) return;

    try {
      if (this.files.existsSync(this.path)) this.files.renameSync(this.path, `${this.path}.corrupt-${this.now()}`);
    } catch (quarantineError) {
      console.error('Impossible de mettre en quarantaine le fichier', quarantineError);
    }
  }
}
