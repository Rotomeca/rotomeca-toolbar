/** Ce que le registre demande à une fenêtre. */
export interface RegistrableWindow {
  isDestroyed(): boolean;
  close(): void;
}

/** Les fenêtres ouvertes de l'application, par nom. */
export class WindowRegistry<W extends RegistrableWindow> {
  private readonly windows = new Map<string, W>();

  /** @throws {Error} Si une fenêtre porte déjà ce nom */
  add(name: string, window: W): void {
    if (this.get(name)) throw new Error(`Une fenêtre nommée « ${name} » existe déjà`);

    this.windows.set(name, window);
  }

  /** @returns La fenêtre, ou `undefined` si elle n'existe pas ou a été détruite (elle est alors oubliée) */
  get(name: string): W | undefined {
    const window = this.windows.get(name);
    if (window?.isDestroyed()) {
      this.windows.delete(name);
      return undefined;
    }

    return window;
  }

  /** Ferme la fenêtre si elle est ouverte, puis l'oublie. */
  remove(name: string): void {
    const window = this.windows.get(name);
    if (window && !window.isDestroyed()) window.close();

    this.windows.delete(name);
  }
}
