/**
 * Bornes de l'état média envoyé par un site, partagées entre le preload des sites et le processus principal.
 *
 * Le site n'est pas fiable : le preload écarte un message trop gros avant de l'envoyer, et le processus
 * principal le refuse avant de le décoder (`JSON.parse` d'une chaîne énorme bloquerait toute l'application).
 */

/** Taille maximale (en caractères) du JSON d'un état média : la pochette intégrée (500 000) plus le reste. */
export const MAX_MEDIA_STATE_LENGTH = 600_000;

/** Délai minimal (ms) entre deux états média acceptés d'un même site : le script légitime en publie un par seconde. */
export const MIN_MEDIA_STATE_INTERVAL_MS = 200;
