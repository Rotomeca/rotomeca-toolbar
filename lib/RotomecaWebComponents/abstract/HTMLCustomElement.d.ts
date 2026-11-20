import type { StyleComponent } from '../libs/StyleComponent.js';

/** Base des composants de la bibliothèque. Seule la partie utilisée par l'application est décrite. */
export class HTMLCustomElement extends HTMLElement {
  /** Racine du composant : son shadow DOM s'il est actif, sinon lui-même. */
  readonly root: ShadowRoot | HTMLElement;
  readonly startingStyle: StyleComponent;

  /** Appelé quand le composant est affiché : les composants dérivés y construisent leur contenu. */
  protected _p_main(): void;
  protected _p_get_data(key: string): string | null;
  protected _p_generate_id(options?: { namespace?: string }): string;

  shadowEnabled(): boolean;
  createText(text: string): Text;
  setData(key: string, value: string, options?: { modifyDom?: boolean }): this;
  disable(): this;
  enable(): this;

  /** Déclare le composant sous cette balise, sans erreur s'il l'est déjà. */
  static TryDefine(tag: string, constructor: CustomElementConstructor): void;
}
