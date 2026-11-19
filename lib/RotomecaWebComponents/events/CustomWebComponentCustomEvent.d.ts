/** Évènement émis par un composant : `caller` est le composant qui l'a émis. */
export class CustomWebComponentCustomEvent<T = unknown> extends CustomEvent<unknown> {
  constructor(type: string, caller: T);

  readonly caller: T;
}
