import { isSafeUrl } from '../../scripts/safeUrl.js';
import type { AppDto } from '../../shared/dto.js';

const MAX_NAME_LENGTH = 200;
const MAX_PICTURE_LENGTH = 2 * 1024 * 1024;

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|bmp);/i;
const FONT_ICON = /^font:[\w-]{1,64}$/;

export type AppData = AppDto;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** @returns L'image si elle est d'un type sûr et de taille raisonnable, sinon null */
function safePicture(picture: unknown): string | null {
  if (typeof picture !== 'string' || picture === '') return null;

  const isDataImage = DATA_IMAGE.test(picture) && picture.length <= MAX_PICTURE_LENGTH;
  return isDataImage || FONT_ICON.test(picture) ? picture : null;
}

/**
 * Valide et nettoie les données d'une application reçues d'une page (IPC).
 * @param data Donnée non fiable
 * @returns Les données nettoyées, ou `null` si l'adresse n'est pas une URL http(s)
 */
export function sanitizeAppData(data: unknown): AppData | null {
  if (!isRecord(data)) return null;

  const { name, url, picture } = data;
  if (typeof url !== 'string' || !isSafeUrl(url)) return null;

  return {
    name: typeof name === 'string' && name.trim() !== '' ? name.slice(0, MAX_NAME_LENGTH) : url,
    url,
    picture: safePicture(picture),
  };
}
