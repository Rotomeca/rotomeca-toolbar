/** Ce qu'il faut d'une notification système (`Electron.Notification` convient). */
interface NotificationLike {
  on(event: 'click', listener: () => void): unknown;
  show(): void;
}

export interface UpdateNotificationDependencies {
  /** Crée une notification ; `isSupported` indique si le système sait en afficher. */
  readonly Notification: {
    isSupported(): boolean;
    new (options: { title: string; body: string; icon: string; urgency: 'normal' }): NotificationLike;
  };
  readonly translate: (key: string) => string;
  /** Chemin de l'icône de l'application. */
  readonly iconPath: string;
  /** Exécuté au clic : ouvre les Paramètres, où se trouve le bouton de mise à jour. */
  readonly onClick: () => void;
}

/**
 * Notification système : une mise à jour est prête (ou disponible sous Linux).
 * Sans effet si le système ne gère pas les notifications.
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
