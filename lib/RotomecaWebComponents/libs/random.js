import { EMPTY_STRING } from './constants.js';

/**
 * Donne des fonctions utile pour l'aléatoire
 * @module Lib/Random
 */

/**
 * @class
 * @classdesc Classe static. Contient des fonctions utiles d'aléatoire.
 */
export class Random {
  /**
   * Génère une nombre entier entre 2 limites.
   * @param {number} min Valeur minimum
   * @param {number} max Valeur maximum
   * @returns {number}
   * @static
   */
  static intRange(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return ~~(Math.random() * (max - min) + min);
  }

  /**
   * Génère une nombre entre 2 limites
   * @param {number} min Valeur minimum
   * @param {number} max Valeur maximum
   * @returns {number}
   */
  static range(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Génère une chaîne aléatoire d'une taille définie
   * @param {number} size 
   * @returns {string}
   */
  static random_string(size) {
    const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

    let str = EMPTY_STRING;

    for (let index = 0; index < size; ++index) {
      str += ALPHA[this.intRange(0, ALPHA.length)];
    }

    return str;
  }
}
