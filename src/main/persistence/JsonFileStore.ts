import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Ce que le magasin demande au système de fichiers : un sous-ensemble de `node:fs`, simple à simuler. */
export interface StoreFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: true }): unknown;
  writeFileSync(path: string, data: string): void;
  copyFileSync(from: string, to: string): void;
  renameSync(from: string, to: string): void;
  readFileSync(path: string): { toString(): string };
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

const nodeFileSystem: StoreFileSystem = {
  existsSync: (target) => fs.existsSync(target),
  mkdirSync: (target, options) => fs.mkdirSync(target, options),
  writeFileSync: (target, data) => fs.writeFileSync(target, data),
  copyFileSync: (from, to) => fs.copyFileSync(from, to),
  renameSync: (from, to) => fs.renameSync(from, to),
  readFileSync: (target) => fs.readFileSync(target),
  readFile: (target, encoding) => fs.promises.readFile(target, encoding),
};

/** Dossier des données de l'application : `%APPDATA%` sous Windows s'il existe, sinon le dossier personnel. */
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
  readonly path: string;
  private readonly directory: string;

  constructor(
    directory: string,
    name: string,
    private readonly files: StoreFileSystem = nodeFileSystem,
    private readonly now: () => number = Date.now,
  ) {
    this.directory = directory;
    this.path = path.join(directory, name);
  }

  /** Écrit les données ; crée le dossier si besoin. */
  save(data: unknown): void {
    if (!this.files.existsSync(this.directory)) this.files.mkdirSync(this.directory, { recursive: true });

    const temporary = `${this.path}.tmp`;
    this.files.writeFileSync(temporary, JSON.stringify(data));
    this.backupExisting();
    this.files.renameSync(temporary, this.path);
  }

  /** @returns Les données, ou `false` si le fichier est absent ou illisible */
  load(): unknown {
    try {
      return JSON.parse(this.files.readFileSync(this.path).toString());
    } catch (error) {
      this.quarantineIfCorrupt(error);
      return false;
    }
  }

  /** @returns Les données, ou `false` si le fichier est absent ou illisible */
  async loadAsync(): Promise<unknown> {
    try {
      return JSON.parse(await this.files.readFile(this.path, 'utf-8'));
    } catch (error) {
      this.quarantineIfCorrupt(error);
      return false;
    }
  }

  private backupExisting(): void {
    if (!this.files.existsSync(this.path)) return;

    try {
      this.files.copyFileSync(this.path, `${this.path}.bak`);
    } catch (error) {
      console.error('Impossible de créer la sauvegarde', error);
    }
  }

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
