/**
 * Notification système qui prévient qu'une mise à jour est prête ; un clic ouvre les Paramètres.
 *
 * Fournie au gestionnaire de mises à jour par `createUpdateManager.ts`. `Notification` est injecté
 * pour tester sans Electron.
 */

/** Ce qu'il faut d'une notification système (`Electron.Notification` convient). */
interface NotificationLike {
  /** Écoute le clic de l'utilisateur sur la notification. */
  on(event: 'click', listener: () => void): unknown;
  /** Affiche la notification. */
  show(): void;
}

/** Ce dont la notification de mise à jour a besoin. */
export interface UpdateNotificationDependencies {
  /** Crée une notification ; `isSupported` indique si le système sait en afficher. */
  readonly Notification: {
    isSupported(): boolean;
    new (options: { title: string; body: string; icon: string; urgency: 'normal' }): NotificationLike;
  };
  /** Traduit les textes de la notification. */
  readonly translate: (key: string) => string;
  /** Chemin de l'icône de l'application. */
  readonly iconPath: string;
  /** Exécuté au clic : ouvre les Paramètres, où se trouve le bouton de mise à jour. */
  readonly onClick: () => void;
}

/**
 * Notification système : une mise à jour est prête (ou disponible sous Linux).
 * Sans effet si le système ne gère pas les notifications.
 *
 * @param dependencies Classe de notification, traduction, icône et action au clic.
 */
export function showUpdateNotification({ Notification, translate, iconPath, onClick }: UpdateNotificationDependencies): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: translate('update.downloadedNotifTitle'),
    body: translate('update.downloadedNotifBody'),
    icon: iconPath,
    urgency: 'normal',
  });
  notification.on('click', onClick);
  notification.show();
}
