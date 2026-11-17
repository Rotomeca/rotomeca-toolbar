import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

export class PageSettings {
  constructor() {
    this.settings ??= {};
    this.main();
  }

  async #initDisplays() {
    const displays = (await window.api.invoke(appEventList.getDisplays)) ?? [];
    if (displays.length < 2) return;

    // Écran enregistré absent : on affiche le principal sans toucher au réglage
    const selected =
      displays.find((d) => d.id === this.settings.displayId) ??
      displays.find((d) => d.isPrimary) ??
      displays[0];
    const container = document.querySelector('#displays');

    for (const display of displays) {
      const button = document.createElement('rotomeca-primary-pressed-button');
      button.dataset.form = 'secondary';
      button.classList.add('setting', 'setting-display');
      button.textContent = display.label;
      container.appendChild(button);

      if (display.id === selected.id) button.press({ enableEvent: false });

      button.addEventListener('event:custom:state.pressed', (event) => {
        document
          .querySelectorAll('.setting-display')
          .forEach((element) => element.unpress());
        event.currentTarget.press({ enableEvent: false });

        this.settings.displayId = display.id;
        window.api.invoke(appEventList.settingsUpdated, this.settings);
      });
    }

    document.querySelector('#display-setting').hidden = false;
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

      document.querySelectorAll('.setting-mode').forEach((button) => {
        if (this.settings.isButtonModeEnabled && button.id === 'button')
          button.press({ enableEvent: false });
        else if (!this.settings.isButtonModeEnabled && button.id === 'mouse')
          button.press({ enableEvent: false });

        button.addEventListener('event:custom:state.pressed', (event) => {
          const caller = event.currentTarget;

          document.querySelectorAll('.setting-mode').forEach((element) => {
            element.unpress();
          });

          caller.press({ enableEvent: false });

          this.settings.isButtonModeEnabled = caller.id === 'button';
          window.api.invoke(appEventList.settingsUpdated, this.settings);

          if (caller.id === 'button')
            document.querySelector('html').classList.remove('without-button');
          else document.querySelector('html').classList.add('without-button');
        });
      });

      document.querySelectorAll('.setting-theme').forEach((button) => {
        if (this.settings.theme === button.id)
          button.press({ enableEvent: false });

        button.addEventListener('event:custom:state.pressed', (event) => {
          const caller = event.currentTarget;

          document.querySelectorAll('.setting-theme').forEach((element) => {
            element.unpress();
          });

          caller.press({ enableEvent: false });

          this.settings.theme = caller.id;
          window.api.invoke(appEventList.settingsUpdated, this.settings);

          let style = document.querySelector('#rootcolor');

          if (!style) {
            style = document.createElement('link');
            //rel="stylesheet" href="../css/fonts/icofont/icofont.min.css"
            style.setAttribute('rel', 'stylesheet');
            style.setAttribute('id', 'rootcolor');
            document.querySelector('head').appendChild(style);
          }

          if (button.id === 'system') style.remove();
          else style.setAttribute('href', `../css/themes/${caller.id}.css`);
        });
      });
    });
  }
}

new PageSettings();
