/**
 * Arguments de lancement refusés dans l'application empaquetée : ceux qui ouvrent un accès de débogage.
 *
 * Utilisé par `bootstrap.ts`. Les fuses d'Electron coupent déjà `--inspect` de Node ; `--remote-debugging-*`
 * est une option de Chromium qu'ils ne couvrent pas et qui donne le contrôle de toutes les pages.
 */

/** Options qui ouvrent un accès de débogage au processus (avec ou sans `=valeur`). */
const DEBUGGING_SWITCHES = ['--remote-debugging-port', '--remote-debugging-pipe', '--inspect', '--inspect-brk', '--inspect-port'];

/**
 * @param argv Arguments de la ligne de commande
 * @returns true si l'un d'eux ouvre un accès de débogage
 */
export function hasDebuggingSwitch(argv: readonly string[]): boolean {
  return argv.some((argument) => DEBUGGING_SWITCHES.some((name) => argument === name || argument.startsWith(`${name}=`)));
}
