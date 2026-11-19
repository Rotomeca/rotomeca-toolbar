/**
 * Point d'entrée Electron : choisit entre évènement Squirrel, mode « fumée » et démarrage normal.
 *
 * C'est le `main` du paquet (une fois compilé dans `dist/`). Tout le démarrage réel est délégué à
 * `src/main/bootstrap.ts` ; ce fichier ne garde que les cas qui doivent quitter ou court-circuiter l'application.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { app } from 'electron';
// [bootstrap.ts] Démarrage du processus principal : instance unique, données protégées, raccourci global, sortie propre
import { bootstrap } from './src/main/bootstrap.js';

// Modules à effet de bord, chargés à la demande : l'un gère les évènements d'installation Squirrel,
// l'autre n'est utile qu'en mode « fumée »
/* eslint-disable @typescript-eslint/no-require-imports */
const isSquirrelEvent = require('electron-squirrel-startup') as boolean;
/* eslint-enable @typescript-eslint/no-require-imports */

if (isSquirrelEvent) {
  // Évènements d'installation/mise à jour Squirrel : on quitte sans démarrer
  app.quit();
} else if (process.argv.includes('--smoke')) {
  // Mode « fumée » : vérifie que le paquet est sain puis quitte, sans démarrer l'application
  // (ni barre ancrée, ni raccourci global, ni verrou d'instance, ni données de l'utilisateur)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('./src/scripts/smokeRun.js') as { run: () => void }).run();
} else {
  bootstrap();
}
