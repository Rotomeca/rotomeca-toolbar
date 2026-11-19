import { JsonFileStore, dataDirectory } from '../persistence/JsonFileStore.js';
import { seasonThemeFor } from '../../scripts/Seasons.js';
import { Settings } from './Settings.js';

let instance: Settings | null = null;

/** @returns Les réglages de l'application, lus dans `settings.rcft` à la première demande */
export function getSettings(): Settings {
  instance ??= new Settings(new JsonFileStore(dataDirectory(), 'settings.rcft'), () => seasonThemeFor());
  return instance;
}
