/**
 * Tirage de la pluie : un jour est pluvieux ou non, de façon déterministe d'après la date locale.
 *
 * Utilisé par le processus principal (`data-weather`) et la page des paramètres (pastille), qui
 * donnent ainsi le même résultat pour une date donnée, dans toutes les fenêtres et après redémarrage.
 */
// [rainFrequency.ts] Jours de pluie par mois et saisons concernées
import { RAINY_PALETTES, RAIN_DAYS_PER_MONTH } from './rainFrequency.js';

/** Base de l'algorithme FNV-1a 32 bits. */
const FNV_OFFSET = 2166136261;
/** Facteur de l'algorithme FNV-1a 32 bits. */
const FNV_PRIME = 16777619;
/** Nombre de valeurs d'un entier 32 bits non signé. */
const UINT32_RANGE = 4294967296;

/**
 * Mélange les bits d'un haché 32 bits (finalisation de MurmurHash3). Les dates se ressemblent
 * (seul le dernier chiffre change) et FNV-1a seul les répartit mal : jusqu'à 5 points d'écart
 * sur la proportion de jours de pluie d'un mois.
 * @param value Entier 32 bits non signé
 * @returns Entier 32 bits non signé aux bits bien répartis
 */
function avalanche(value: number): number {
  let h = value;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * @param text Texte à hacher
 * @returns Un nombre dans [0, 1[ dérivé du texte (FNV-1a 32 bits, puis mélange des bits)
 */
function hashToUnit(text: string): number {
  let hash = FNV_OFFSET;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return avalanche(hash) / UINT32_RANGE;
}

/**
 * @param date Jour à évaluer (heure locale)
 * @param rainDaysPerMonth Jours de pluie par mois, de janvier à décembre
 * @returns `true` si le jour tiré est pluvieux : `hash("AAAA-M-J") < joursDePluie[mois] / joursDansLeMois`
 */
export function isRainyDay(date: Date, rainDaysPerMonth: readonly number[] = RAIN_DAYS_PER_MONTH): boolean {
  const month = date.getMonth();
  const daysInMonth = new Date(date.getFullYear(), month + 1, 0).getDate();
  const rainDays = rainDaysPerMonth[month] ?? 0;
  const seed = `${date.getFullYear()}-${month + 1}-${date.getDate()}`;

  return hashToUnit(seed) < rainDays / daysInMonth;
}

/**
 * @param palette Palette de saison
 * @returns `true` si cette saison peut avoir de la pluie (été, automne, printemps)
 */
export function canRain(palette: string): boolean {
  return RAINY_PALETTES.includes(palette);
}
