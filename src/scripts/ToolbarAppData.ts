/**
 * Données d'une application affichée sur un bouton de la barre : adresse, titre, image.
 *
 * Utilisé par la page de la barre (`src/page.taskbar/`) et ses boutons. Ne dépend de rien.
 */

/** Les informations d'une application affichée sur un bouton de la barre. */
export class ToolbarAppData {
  /**
   * @param link Adresse de l'application
   * @param title Titre affiché
   * @param picture Image de l'application, ou `null`
   */
  constructor(
    /** Adresse de l'application. */
    readonly link: string,
    /** Titre affiché sous le bouton. */
    readonly title: string,
    /** Image intégrée (`data:image/...`), icône de police (`font:nom`) ou `null`. */
    readonly picture: string | null,
  ) {}

  /** @returns La racine du site (protocole et hôte), où chercher son favicon */
  get path(): string {
    const [protocol, rest] = this.link.split('://');
    return rest === undefined ? this.link : `${protocol}://${rest.split('/')[0] ?? ''}`;
  }

  /** @returns `true` si l'application a une image ou une icône choisie */
  hasPicture(): boolean {
    return !!this.picture;
  }
}
