/** Une règle CSS produite par `StyleComponent.RuleClass.Write`. */
export interface Rule {
  readonly selector: string;
}

/** Les règles d'une feuille : sélecteur → propriétés CSS. */
export type RuleSet = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Style (shadow DOM) d'un composant. */
export class StyleComponent {
  /** Ajoute des règles CSS au composant. */
  addSomeCss(rules: readonly Rule[]): this;

  static get RuleClass(): {
    /** Transforme un objet de règles en liste de règles utilisables par `addSomeCss`. */
    Write(rules: RuleSet): Rule[];
  };
}
