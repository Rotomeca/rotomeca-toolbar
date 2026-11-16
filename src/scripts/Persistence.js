const fs = require('fs');
const path = require('path');

// NE JAMAIS MODIFIER : changer ce nom ferait perdre les sessions/cookies/localStorage
const USER_DATA_NAME = 'rotomecatoolbar';
const DATA_FILES = ['data.rsft', 'settings.rcft'];
// Un an : les cookies de session deviennent persistants pour garder les logins
const COOKIE_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

/**
 * Fige le dossier userData sur `%APPDATA%/rotomecatoolbar` (celui utilisé depuis
 * la 1.0.0) pour que le stockage des sites (cookies, localStorage, ...) ne
 * change jamais, quel que soit `productName`/`appId`.
 * À appeler avant l'évènement `ready`.
 * @param {Electron.App} app
 */
function pinUserData(app) {
  app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_NAME));
}

/**
 * Copie (sans jamais supprimer la source) les fichiers de données de la 1.x,
 * écrits en chemin relatif dans le dossier de l'application, vers le dossier
 * de données actuel s'ils n'y existent pas encore.
 * @param {Electron.App} app
 * @param {string} dataDir Dossier de données actuel
 */
function migrateLegacyData(app, dataDir) {
  try {
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
    } catch (e) {}

    fs.mkdirSync(dataDir, { recursive: true });

    for (const file of DATA_FILES) {
      const target = path.join(dataDir, file);
      if (fs.existsSync(target)) continue;

      let best = null;
      for (const dir of candidates) {
        const source = path.join(dir, file);
        try {
          const stat = fs.statSync(source);
          if (stat.isFile() && (!best || stat.mtimeMs > best.mtimeMs))
            best = { source, mtimeMs: stat.mtimeMs };
        } catch (e) {}
      }

      if (best) fs.copyFileSync(best.source, target);
    }
  } catch (error) {
    console.error('Migration des données impossible', error);
  }
}

const BACKUP_DIR_NAME = 'backups';
const MAX_BACKUPS = 5;

/**
 * Copie les fichiers de données dans `<dataDir>/backups/<version>-<timestamp>/`
 * avant l'installation d'une mise à jour. Ne supprime jamais les données
 * actives ; seules les sauvegardes les plus anciennes sont purgées.
 * @param {Electron.App} app
 * @param {string} dataDir Dossier de données actuel
 */
function backupUserData(app, dataDir) {
  try {
    const files = DATA_FILES.filter((f) =>
      fs.existsSync(path.join(dataDir, f)),
    );
    if (!files.length) return;

    const root = path.join(dataDir, BACKUP_DIR_NAME);
    const target = path.join(root, `${app.getVersion()}-${Date.now()}`);
    fs.mkdirSync(target, { recursive: true });
    for (const f of files)
      fs.copyFileSync(path.join(dataDir, f), path.join(target, f));

    const old = fs
      .readdirSync(root)
      .map((name) => ({ name, mtime: fs.statSync(path.join(root, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(MAX_BACKUPS);
    for (const { name } of old)
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
  } catch (error) {
    console.error('Sauvegarde des données impossible', error);
  }
}

/**
 * Restaure depuis la sauvegarde la plus récente les fichiers de données
 * absents du dossier de données.
 * @param {string} dataDir Dossier de données actuel
 */
function restoreFromBackup(dataDir) {
  try {
    const root = path.join(dataDir, BACKUP_DIR_NAME);
    if (!fs.existsSync(root)) return;

    const backups = fs
      .readdirSync(root)
      .map((name) => ({ name, mtime: fs.statSync(path.join(root, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of DATA_FILES) {
      const target = path.join(dataDir, file);
      if (fs.existsSync(target)) continue;
      const found = backups.find((b) =>
        fs.existsSync(path.join(root, b.name, file)),
      );
      if (found) fs.copyFileSync(path.join(root, found.name, file), target);
    }
  } catch (error) {
    console.error('Restauration des données impossible', error);
  }
}

/**
 * Force l'écriture des cookies sur le disque.
 * @param {Electron.Session} session
 */
function flushSession(session) {
  try {
    session.cookies.flushStore();
    session.flushStorageData();
  } catch (error) {
    console.error('flush impossible', error);
  }
}

/**
 * Rend persistants les cookies de session (sans expiration) et vide
 * régulièrement le cache disque des cookies pour ne pas perdre de login.
 * @param {Electron.Session} session
 */
function keepLoginsAlive(session) {
  session.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie.session) return;

    const scheme = cookie.secure ? 'https' : 'http';
    const host = cookie.domain.replace(/^\./, '');
    session.cookies
      .set({
        url: `${scheme}://${host}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_SECONDS,
      })
      .catch(() => {});
  });

  const timer = setInterval(() => flushSession(session), 60 * 1000);
  timer.unref?.();
}

module.exports = {
  pinUserData,
  migrateLegacyData,
  backupUserData,
  restoreFromBackup,
  flushSession,
  keepLoginsAlive,
};
