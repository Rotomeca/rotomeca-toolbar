/**
 * Page d'ajout ou de modification d'une application : adresse, nom et image du bouton.
 *
 * Chargée par la fenêtre de modification (`src/page.add/`). S'appuie sur `appForm` pour les noms et adresses
 * et sur le processus principal pour enregistrer ; le mode édition est activé par l'évènement `modeEdit`.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [rds.d.ts] Types des composants `rds-*` du design system utilisés par les pages
import type { RdsButton, RdsFileInput, RdsInput } from '../types/rds.js';
// [appForm.ts] Fonctions pures du formulaire d'application : adresse, nom proposé, comparaison d'adresses
import { chosenName, suggestedName, withProtocol } from '../scripts/appForm.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
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

  /** Branche les champs et les boutons, et passe en mode édition quand le processus principal le demande. */
  start(): void {
    this.urlInput.addEventListener('change', () => this.onUrlChange());
    this.pictureInput.addEventListener('change', () => this.onPictureChange());
    this.clearButton.addEventListener('click', () => this.onClearPicture());

    this.saveButton.onclick = () => this.saveNew();
    this.saveButton.disabled = !this.urlInput.value;

    window.api.on(pageEventList.modeEdit, (_, app) => {
      document.title = window.api.t('add.editTitle');

      this.saveButton.disabled = false;
      this.urlInput.value = app.url;
      this.nameInput.value = app.title || app.name || '';
      this.nameInput.setAttribute('placeholder', this.name);

      this.picture = app.picture || null;
      this.saveButton.textContent = window.api.t('add.edit');
      this.updateClearButton();

      this.saveButton.onclick = () => {
        window.api
          .invoke(appEventList.requestUpdatedData, { name: this.name, url: this.url, picture: this.picture, id: app.index })
          .catch(console.error);
      };
    });
  }

  /** Le bouton qui vide l'image n'est utilisable que si une image est gardée. */
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

  /** Demande au processus principal d'ajouter une nouvelle application à la barre. */
  private saveNew(): void {
    window.api.invoke(appEventList.requestAddData, { name: this.name, url: this.url, picture: this.picture }).catch(console.error);
  }
}

new EditPage().start();
