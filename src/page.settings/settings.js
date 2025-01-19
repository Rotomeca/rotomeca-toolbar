import { appEventList } from '../scripts/events/AppEventListModule.js';

export class PageSettings {
  constructor() {
    this.settings ??= {};
    this.main();
  }

  async main() {
    window.api.on('settingsStart', async (_, path) => {
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

      this.settings ??= {};
      this.settings.isButtonModeEnabled ??= true;
      this.settings.theme ??= 'system';

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
