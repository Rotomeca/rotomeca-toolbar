/**
 * Validation et nettoyage des données d'une application reçues d'une page (nom, adresse, icône).
 *
 * Utilisé par la liste des applications avant tout ajout ou modification : une page n'est pas fiable,
 * et l'adresse et l'image finissent affichées ou chargées par la barre.
 */
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isPlainWebUrl } from '../../scripts/safeUrl.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { AppDto } from '../../shared/dto.js';

/** Longueur maximale conservée pour le nom d'une application. */
const MAX_NAME_LENGTH = 200;
/** Taille maximale (en caractères) d'une icône en `data:`, soit environ 2 Mo. */
const MAX_PICTURE_LENGTH = 2 * 1024 * 1024;

/** Types d'image acceptés en `data:`. */
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|bmp);/i;
/** Icône de police du projet, sous la forme `font:nom`. */
const FONT_ICON = /^font:[\w-]{1,64}$/;

/** Données d'une application une fois nettoyées. */
export type AppData = AppDto;

/** Vrai si la valeur est un objet dont on peut lire les champs. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * @param picture Icône brute envoyée par la page.
 * @returns L'image si elle est d'un type sûr et de taille raisonnable, sinon null
 */
function safePicture(picture: unknown): string | null {
  if (typeof picture !== 'string' || picture === '') return null;

  const isDataImage = DATA_IMAGE.test(picture) && picture.length <= MAX_PICTURE_LENGTH;
  return isDataImage || FONT_ICON.test(picture) ? picture : null;
}

/**
 * Valide et nettoie les données d'une application reçues d'une page (IPC).
 * @param data Donnée non fiable
 * @returns Les données nettoyées, ou `null` si l'adresse n'est pas une URL http(s) nette (sans espace ni identifiants)
 */
export function sanitizeAppData(data: unknown): AppData | null {
  if (!isRecord(data)) return null;

  const { name, picture } = data;
  // Les espaces autour d'une adresse collée sont retirés ; ceux du milieu la rendent refusée
  const url = typeof data['url'] === 'string' ? data['url'].trim() : null;
  if (url === null || !isPlainWebUrl(url)) return null;

  return {
    name: typeof name === 'string' && name.trim() !== '' ? name.slice(0, MAX_NAME_LENGTH) : url,
    url,
    picture: safePicture(picture),
  };
}
