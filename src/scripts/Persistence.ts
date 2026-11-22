/**
 * Données de l'utilisateur : dossier userData figé, migration, sauvegardes et cookies de session.
 *
 * Utilisé par le processus principal au démarrage et avant une mise à jour.
 * Il existe pour ne jamais perdre les données ni les connexions des sites
 * d'une version à l'autre (installation Squirrel, ancienne 1.x).
 */
// [node:fs] accès au système de fichiers (Node.js)
import fs from 'node:fs';
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { App, Cookie, Session } from 'electron';

// NE JAMAIS MODIFIER : changer ce nom ferait perdre les sessions/cookies/localStorage
const USER_DATA_NAME = 'rotomecatoolbar';
/** Fichiers de données de l'application, copiés lors des migrations et sauvegardes. */
const DATA_FILES = ['data.rsft', 'settings.rcft', 'permissions.rcft'] as const;
// Un an : les cookies de session deviennent persistants pour garder les logins
const COOKIE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;
/** Intervalle entre deux écritures forcées des cookies sur le disque. */
const FLUSH_INTERVAL_MS = 60 * 1000;

/** Sous-dossier de userData qui contient les sauvegardes. */
const BACKUP_DIR_NAME = 'backups';
/** Nombre de sauvegardes conservées ; les plus anciennes sont purgées. */
const MAX_BACKUPS = 5;

/** Ce que ce module lit d'Electron : de petites parties de `app` et `session`, simples à simuler. */
type UserDataApp = Pick<App, 'isPackaged' | 'getPath' | 'setPath'>;
/** Partie de `app` nécessaire pour retrouver les données de la 1.x. */
type LegacyDataApp = Pick<App, 'getAppPath' | 'getPath'>;
/** Partie de `app` nécessaire pour nommer une sauvegarde avec la version. */
type VersionedApp = Pick<App, 'getVersion'>;
/** Partie de `app` nécessaire au journal de diagnostic des cookies. */
type DiagnosticApp = Pick<App, 'getVersion' | 'getPath'>;
/** Partie de `session` nécessaire pour lire et écrire les cookies. */
type CookieSession = Pick<Session, 'cookies'>;
/** Partie de `session` nécessaire pour, en plus, forcer l'écriture sur disque. */
type FlushableSession = Pick<Session, 'cookies' | 'flushStorageData'>;

/** Fichier ou dossier avec sa date de dernière modification. */
interface DatedEntry {
  readonly name: string;
  readonly mtimeMs: number;
}

/**
 * Fige le dossier userData sur `%APPDATA%/rotomecatoolbar` (celui utilisé depuis
 * la 1.0.0) pour que le stockage des sites (cookies, localStorage, ...) ne
 * change jamais, quel que soit `productName`/`appId`.
 * À appeler avant l'évènement `ready`.
 * @param app Application Electron (chemins et mode empaqueté)
 */
export function pinUserData(app: UserDataApp): void {
  // En dev, le fuse EnableCookieEncryption n'est pas appliqué : partager le
  // dossier avec la version installée rendrait les cookies illisibles (logins
  // perdus). On isole donc le stockage de développement.
  const name = app.isPackaged ? USER_DATA_NAME : `${USER_DATA_NAME}-dev`;
  app.setPath('userData', path.join(app.getPath('appData'), name));
}

/**
 * Liste les dossiers où la 1.x a pu écrire ses données (chemin relatif).
 * @param app Application Electron (chemins de l'exécutable et de l'application)
 * @returns Les dossiers candidats, y compris les `app-x.y.z` voisins de Squirrel
 */
function legacyDataCandidates(app: LegacyDataApp): Set<string> {
  const candidates = new Set([process.cwd(), path.dirname(app.getAppPath())]);
  const exeDir = path.dirname(app.getPath('exe'));
  candidates.add(exeDir);
  candidates.add(path.dirname(exeDir));

  // Dossiers app-x.y.z voisins (versions précédentes installées par Squirrel)
  const root = path.dirname(exeDir);
  try {
    for (const entry of fs.readdirSync(root)) {
      if (/^app-\d/.test(entry)) candidates.add(path.join(root, entry));
    }
  } catch {
    // Dossier parent illisible : on continue sans versions voisines
  }

  return candidates;
}

/**
 * Cherche la version la plus à jour d'un fichier parmi plusieurs dossiers.
 * @param dirs Dossiers à parcourir
 * @param file Nom du fichier recherché
 * @returns Le plus récemment modifié des fichiers `file` trouvés dans les dossiers, ou null
 */
function newestFile(dirs: Iterable<string>, file: string): string | null {
  let best: { source: string; mtimeMs: number } | null = null;

  for (const dir of dirs) {
    const source = path.join(dir, file);
    try {
      const stat = fs.statSync(source);
      if (stat.isFile() && (!best || stat.mtimeMs > best.mtimeMs)) best = { source, mtimeMs: stat.mtimeMs };
    } catch {
      // Fichier absent dans cette version : on passe à la suivante
    }
  }

  return best?.source ?? null;
}

/**
 * Copie (sans jamais supprimer la source) les fichiers de données de la 1.x,
 * écrits en chemin relatif dans le dossier de l'application, vers le dossier
 * de données actuel s'ils n'y existent pas encore.
 * @param app Application Electron (chemins de l'exécutable et de l'application)
 * @param dataDir Dossier de données actuel
 */
export function migrateLegacyData(app: LegacyDataApp, dataDir: string): void {
  try {
    const candidates = legacyDataCandidates(app);
    fs.mkdirSync(dataDir, { recursive: true });

    for (const file of DATA_FILES) {
      const target = path.join(dataDir, file);
      if (fs.existsSync(target)) continue;

      const source = newestFile(candidates, file);
      if (source) fs.copyFileSync(source, target);
    }
  } catch (error) {
    console.error('Migration des données impossible', error);
  }
}

/**
 * Liste les sauvegardes présentes.
 * @param root Dossier des sauvegardes
 * @returns Les sauvegardes de `root`, de la plus récente à la plus ancienne
 */
function listBackups(root: string): DatedEntry[] {
  return fs
    .readdirSync(root)
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(root, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Copie les fichiers de données dans `<dataDir>/backups/<version>-<timestamp>/`
 * avant l'installation d'une mise à jour. Ne supprime jamais les données
 * actives ; seules les sauvegardes les plus anciennes sont purgées.
 * @param app Application Electron (sa version nomme la sauvegarde)
 * @param dataDir Dossier de données actuel
 */
export function backupUserData(app: VersionedApp, dataDir: string): void {
  try {
    const files = DATA_FILES.filter((file) => fs.existsSync(path.join(dataDir, file)));
    if (files.length === 0) return;

    const root = path.join(dataDir, BACKUP_DIR_NAME);
    const target = path.join(root, `${app.getVersion()}-${Date.now()}`);
    fs.mkdirSync(target, { recursive: true });
    for (const file of files) fs.copyFileSync(path.join(dataDir, file), path.join(target, file));

    for (const { name } of listBackups(root).slice(MAX_BACKUPS))
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
  } catch (error) {
    console.error('Sauvegarde des données impossible', error);
  }
}

/**
 * Restaure depuis la sauvegarde la plus récente les fichiers de données
 * absents du dossier de données.
 * @param dataDir Dossier de données actuel
 */
export function restoreFromBackup(dataDir: string): void {
  try {
    const root = path.join(dataDir, BACKUP_DIR_NAME);
    if (!fs.existsSync(root)) return;

    const backups = listBackups(root);
    for (const file of DATA_FILES) {
      const target = path.join(dataDir, file);
      if (fs.existsSync(target)) continue;

      const found = backups.find((backup) => fs.existsSync(path.join(root, backup.name, file)));
      if (found) fs.copyFileSync(path.join(root, found.name, file), target);
    }
  } catch (error) {
    console.error('Restauration des données impossible', error);
  }
}

/**
 * Force l'écriture des cookies et du stockage de la session sur le disque.
 * @param session Session Electron concernée
 */
export function flushSession(session: FlushableSession): void {
  try {
    void session.cookies.flushStore();
    session.flushStorageData();
  } catch (error) {
    console.error('flush impossible', error);
  }
}

/**
 * Réécrit un cookie de session avec une date d'expiration à un an.
 * @param session Session Electron qui porte le cookie
 * @param cookie Cookie de session à rendre persistant
 */
function persistCookie(session: CookieSession, cookie: Cookie): Promise<void> {
  const scheme = cookie.secure ? 'https' : 'http';
  const host = (cookie.domain ?? '').replace(/^\./, '');

  return session.cookies
    .set({
      url: `${scheme}://${host}${cookie.path || '/'}`,
      name: cookie.name,
      value: cookie.value,
      ...(cookie.domain !== undefined && { domain: cookie.domain }),
      ...(cookie.path !== undefined && { path: cookie.path }),
      ...(cookie.secure !== undefined && { secure: cookie.secure }),
      ...(cookie.httpOnly !== undefined && { httpOnly: cookie.httpOnly }),
      ...(cookie.sameSite !== undefined && { sameSite: cookie.sameSite }),
      expirationDate: Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_SECONDS,
    })
    .catch((error: unknown) => {
      // Un cookie refusé ne doit pas empêcher les autres d'être conservés
      console.debug('Cookie de session non conservé', cookie.name, error);
    });
}

/**
 * Journalise (sans les valeurs) l'état des cookies Google/YouTube dans
 * `<userData>/cookie-diagnostic.log`, pour comprendre une perte de login.
 * @param app Application Electron (version et dossier userData)
 * @param session Session Electron dont on lit les cookies
 * @param moment Évènement à l'origine du relevé
 */
export async function logCookieState(app: DiagnosticApp, session: CookieSession, moment: string): Promise<void> {
  try {
    const cookies = (await session.cookies.get({})).filter((cookie) => /google|youtube/i.test(cookie.domain ?? ''));
    const sessionOnly = cookies.filter((cookie) => cookie.session).length;
    const expirations = cookies.flatMap((cookie) => (cookie.expirationDate ? [cookie.expirationDate] : []));
    const soonest = Math.min(...expirations);
    const soonestLabel = Number.isFinite(soonest) ? new Date(soonest * 1000).toISOString() : 'n/a';

    const line = `${new Date().toISOString()} v${app.getVersion()} ${moment}: ${cookies.length} cookies google/youtube, ${sessionOnly} de session, plus proche expiration ${soonestLabel}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'cookie-diagnostic.log'), line);
  } catch (error) {
    console.error('Diagnostic des cookies impossible', error);
  }
}

/**
 * Rend persistants les cookies de session (sans expiration) et vide
 * régulièrement le cache disque des cookies pour ne pas perdre de login.
 * @param session Session Electron des sites
 * @param app Si fourni, active le journal de diagnostic
 */
export function keepLoginsAlive(session: FlushableSession, app?: DiagnosticApp): void {
  session.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie.session) return;
    void persistCookie(session, cookie);
  });

  // Les cookies de session déjà présents (login antérieur à cet écouteur)
  // n'émettent aucun évènement : on les rend persistants dès le démarrage.
  session.cookies
    .get({})
    .then((cookies) => Promise.all(cookies.filter((cookie) => cookie.session).map((cookie) => persistCookie(session, cookie))))
    .then(() => (app ? logCookieState(app, session, 'démarrage') : undefined))
    .catch((error: unknown) => console.error('Conservation des cookies de session impossible', error));

  setInterval(() => flushSession(session), FLUSH_INTERVAL_MS).unref();
}
