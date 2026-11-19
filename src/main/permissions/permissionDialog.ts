import type { Dialog } from 'electron';

type Translate = (key: string, variables?: Readonly<Record<string, string | number>>) => string;

export interface PermissionDialogDependencies {
  readonly dialog: Pick<Dialog, 'showMessageBox'>;
  readonly translate: Translate;
}

/** Clé de traduction décrivant chaque permission que l'on demande à l'utilisateur. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  media: 'permission.media',
  geolocation: 'permission.geolocation',
};

const ALLOW_BUTTON = 0;
const DENY_BUTTON = 1;

/**
 * Crée la question posée à l'utilisateur quand un site demande une permission sensible.
 * La réponse par défaut (Entrée, ou fermeture de la boîte) est un refus.
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
