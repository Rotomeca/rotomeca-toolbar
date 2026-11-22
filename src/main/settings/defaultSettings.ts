/**
 * Instance unique des réglages de l'application, lue dans le fichier `settings.rcft`.
 *
 * Évite de passer les réglages partout : `App.ts` les récupère ici et les injecte dans les services.
 */
// [JsonFileStore.ts] Fichier JSON sûr : écriture atomique, sauvegarde `.bak`, mise en quarantaine d'un fichier corrompu
import { JsonFileStore, dataDirectory } from '../persistence/JsonFileStore.js';
// [Seasons.ts] Saisons : dates officielles des équinoxes et des solstices, et thème de saison du jour
import { seasonThemeFor } from '../../scripts/Seasons.js';
// [Settings.ts] Réglages de l'utilisateur : accesseurs validés au-dessus d'un fichier de réglages
import { Settings } from './Settings.js';

/** Réglages déjà créés ; `null` avant la première demande. */
let instance: Settings | null = null;

/** @returns Les réglages de l'application, lus dans `settings.rcft` à la première demande */
export function getSettings(): Settings {
  instance ??= new Settings(new JsonFileStore(dataDirectory(), 'settings.rcft'), () => seasonThemeFor());
  return instance;
}
