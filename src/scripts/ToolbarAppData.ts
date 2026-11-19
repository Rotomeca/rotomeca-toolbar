/** Les informations d'une application affichée sur un bouton de la barre. */
export class ToolbarAppData {
  constructor(
    /** Adresse de l'application. */
    readonly link: string,
    readonly title: string,
    /** Image intégrée (`data:image/...`), icône de police (`font:nom`) ou `null`. */
    readonly picture: string | null,
  ) {}

  /** @returns La racine du site (protocole et hôte), où chercher son favicon */
  get path(): string {
    const [protocol, rest] = this.link.split('://');
    return rest === undefined ? this.link : `${protocol}://${rest.split('/')[0] ?? ''}`;
  }

  hasPicture(): boolean {
    return !!this.picture;
  }
}
