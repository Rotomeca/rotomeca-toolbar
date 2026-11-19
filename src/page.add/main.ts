import '../scripts/ds.js';
import type { RdsButton, RdsFileInput, RdsInput } from '../types/rds.js';
import { chosenName, suggestedName, withProtocol } from '../scripts/appForm.js';
import { requireElement } from '../scripts/dom.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** La page de modification d'une application de la barre. */
class EditPage {
  private picture: string | null = null;

  private readonly urlInput = requireElement<RdsInput>('#urlbox');
  private readonly nameInput = requireElement<RdsInput>('#namebox');
  private readonly pictureInput = requireElement<RdsFileInput>('#picturebox');
  private readonly saveButton = requireElement<RdsButton>('#save');
  private readonly clearButton = requireElement<RdsButton>('#clear');

  /** Adresse saisie, complétée du protocole. */
  private get url(): string {
    return withProtocol(this.urlInput.value ?? '');
  }

  /** Nom à enregistrer. */
  private get name(): string {
    return chosenName(this.nameInput.value, this.url);
  }

  start(): void {
    this.urlInput.addEventListener('change', () => this.onUrlChange());
    this.pictureInput.addEventListener('change', () => this.onPictureChange());
    this.clearButton.addEventListener('click', () => this.onClearPicture());

    this.saveButton.onclick = () => this.saveNew();
    this.saveButton.disabled = !this.urlInput.value;

    window.api.on(pageEventList.modeEdit, (_, app) => {
      document.title = 'Modifier une application';

      this.saveButton.disabled = false;
      this.urlInput.value = app.url;
      this.nameInput.value = app.title || app.name || '';
      this.nameInput.setAttribute('placeholder', this.name);

      this.picture = app.picture || null;
      this.saveButton.textContent = 'Modifier';
      this.updateClearButton();

      this.saveButton.onclick = () => {
        window.api
          .invoke(appEventList.requestUpdatedData, { name: this.name, url: this.url, picture: this.picture, id: app.index })
          .catch(console.error);
      };
    });
  }

  private updateClearButton(): void {
    this.clearButton.disabled = !this.picture;
  }

  /** L'adresse change : le nom proposé suit, et la sauvegarde n'est possible qu'avec une adresse. */
  private onUrlChange(): void {
    this.nameInput.setAttribute('placeholder', suggestedName(this.url));

    if (!this.nameInput.value) this.nameInput.value = this.name;

    this.saveButton.disabled = this.url === '';
  }

  /** Une image est choisie : ses données sont lues et gardées en mémoire. */
  private onPictureChange(): void {
    const [file] = this.pictureInput.files;

    // Fichier retiré de la liste : on oublie l'image
    if (!file) {
      this.picture = null;
      this.updateClearButton();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.picture = typeof reader.result === 'string' ? reader.result : null;
      this.updateClearButton();
    };
    reader.readAsDataURL(file);
  }

  /** Le bouton qui vide l'image : on vide le champ et la mémoire. */
  private onClearPicture(): void {
    this.pictureInput.clear();
    this.picture = null;
    this.updateClearButton();
  }

  private saveNew(): void {
    window.api.invoke(appEventList.requestAddData, { name: this.name, url: this.url, picture: this.picture }).catch(console.error);
  }
}

new EditPage().start();
