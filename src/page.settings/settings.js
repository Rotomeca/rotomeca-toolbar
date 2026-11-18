import '../scripts/ds.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

export class PageSettings {
  constructor() {
    this.settings ??= {};
    this.main();
  }

  /**
   * Notifie le processus principal que les réglages ont changé
   */
  #saveSettings() {
    window.api.invoke(appEventList.settingsUpdated, this.settings);
  }

  async #initDisplays() {
    const displays = (await window.api.invoke(appEventList.getDisplays)) ?? [];
    if (displays.length < 2) return;

    // Écran enregistré absent : on affiche le principal sans toucher au réglage
    const selected =
      displays.find((d) => d.id === this.settings.displayId) ??
      displays.find((d) => d.isPrimary) ??
      displays[0];
    const select = document.querySelector('#displays');

    for (const display of displays) {
      const option = document.createElement('option');
      option.value = String(display.id);
      option.textContent = display.label;
      select.appendChild(option);
    }

    select.value = String(selected.id);

    select.addEventListener('rds-select:change', (event) => {
      const display = displays.find(
        (d) => String(d.id) === event.detail.value,
      );
      if (!display) return;

      this.settings.displayId = display.id;
      this.#saveSettings();
    });

    document.querySelector('#display-setting').hidden = false;
  }

  #initMode() {
    const control = document.querySelector('#mode');
    control.value = this.settings.isButtonModeEnabled ? 'button' : 'mouse';

    control.addEventListener('rds-segmented-control:change', (event) => {
      const isButton = event.detail.value === 'button';

      this.settings.isButtonModeEnabled = isButton;
      this.#saveSettings();

      document.documentElement.classList.toggle('without-button', !isButton);
    });
  }

  #initTheme() {
    const select = document.querySelector('#theme');
    select.value = this.settings.theme;

    select.addEventListener('rds-select:change', (event) => {
      const theme = event.detail.value;

      this.settings.theme = theme;
      this.#saveSettings();

      let style = document.querySelector('#rootcolor');

      if (!style) {
        style = document.createElement('link');
        style.setAttribute('rel', 'stylesheet');
        style.setAttribute('id', 'rootcolor');
        document.querySelector('head').appendChild(style);
      }

      style.setAttribute('href', `../css/themes/${theme}.css`);
      document.documentElement.dataset.appTheme = theme;
    });
  }

  async main() {
    window.api.on(pageEventList.settingsStart, async (_, path) => {
      console.log('path', path);
      await fetch(path)
        .then(function (response) {
          return response.json();
        })
        .then(
          function (data) {
            this.settings = data ?? {};
          }.bind(this),
        )
        .catch(function (err) {
          console.error('error: ' + err);
        });

      document.querySelector('#app-version').textContent =
        await window.api.invoke(appEventList.getVersion);

      this.settings ??= {};
      this.settings.isButtonModeEnabled ??= true;
      this.settings.theme ??= 'system';

      await this.#initDisplays();
      this.#initMode();
      this.#initTheme();
    });
  }
}

new PageSettings();
