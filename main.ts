import { app } from 'electron';
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
