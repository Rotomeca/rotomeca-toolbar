/**
 * Boîte de dialogue qui demande à l'utilisateur d'autoriser une permission sensible d'un site.
 *
 * Fournie à la politique de permissions par `bootstrap.ts`. Le dialogue et la traduction sont injectés
 * pour pouvoir tester la question sans Electron.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import type { Dialog } from 'electron';

/** Fonction de traduction : clé, variables facultatives, texte. */
type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

/** Ce dont la boîte de dialogue a besoin. */
export interface PermissionDialogDependencies {
  /** Affichage d'une boîte de message (module `dialog` d'Electron). */
  readonly dialog: Pick<Dialog, 'showMessageBox'>;
  /** Traduit les textes de la boîte. */
  readonly translate: Translate;
}

/** Clé de traduction décrivant chaque permission que l'on demande à l'utilisateur. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  media: 'permission.media',
  geolocation: 'permission.geolocation',
};

/** Position du bouton « Autoriser » dans la boîte. */
const ALLOW_BUTTON = 0;

/** Position du bouton « Refuser » ; c'est aussi la réponse par défaut. */
const DENY_BUTTON = 1;

/**
 * Crée la question posée à l'utilisateur quand un site demande une permission sensible.
 * La réponse par défaut (Entrée, ou fermeture de la boîte) est un refus.
 * @param dependencies Dialogue Electron et traduction.
 * @returns Une fonction qui renvoie `true` si l'utilisateur autorise
 */
export function createPermissionDialog({
  dialog,
  translate,
}: PermissionDialogDependencies): (origin: string, permission: string) => Promise<boolean> {
  return async (origin, permission) => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: [translate('permission.allow'), translate('permission.deny')],
      defaultId: DENY_BUTTON,
      cancelId: DENY_BUTTON,
      title: translate('permission.title'),
      message: translate('permission.message', {
        origin,
        action: translate(ACTION_LABELS[permission] ?? permission),
      }),
      detail: translate('permission.remembered'),
    });

    return response === ALLOW_BUTTON;
  };
}
