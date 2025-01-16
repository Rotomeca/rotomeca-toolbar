import { CustomWebComponentCustomEvent } from '../events/CustomWebComponentCustomEvent.js';
import { StateChangedEvent } from '../events/StateChangedEvent.js';
import { JsEvent } from '../libs/events.js';
import { HTMLCustomButton } from './HTMLCustomButton.js';

export { HTMLCustomPressedButton };

class HTMLCustomPressedButton extends HTMLCustomButton {
  constructor() {
    super();

    this.onpressed = new JsEvent();
    this.onunpressed = new JsEvent();
    this.ontoggled = new JsEvent();

    this.onpressed.add('default', () => {
      this.dispatchEvent(
        new CustomWebComponentCustomEvent('event:custom:state.pressed', this),
      );
    });

    this.onunpressed.add('default', () => {
      this.dispatchEvent(
        new CustomWebComponentCustomEvent('event:custom:state.unpressed', this),
      );
    });

    this.ontoggled.add('default', (state) => {
      this.dispatchEvent(new StateChangedEvent(state, this));
    });
  }

  _p_main() {
    super._p_main();

    this.addEventListener('click', this.toggleState.bind(this));

    if (
      ![null, undefined, false, 'false', 0].includes(
        this._p_get_data('pressed'),
      )
    ) {
      this.#_press();
    }
  }

  get isPressed() {
    return [1, true, 'true'].includes(this.ariaPressed);
  }

  #_press() {
    this.ariaPressed = true;
    this.setAttribute('aria-pressed', true);
    this.internals.states.add('pressed');
    return this;
  }

  press({ enableEvent = true } = {}) {
    this.#_press();

    if (enableEvent) this.onpressed.call(this);

    return this;
  }

  unpress({ enableEvent = true } = {}) {
    this.ariaPressed = false;
    this.setAttribute('aria-pressed', false);
    this.internals.states.delete('pressed');

    if (enableEvent) this.onunpressed.call(this);

    return this;
  }

  toggleState() {
    this.ontoggled.call(!this.isPressed, this);

    if (this.isPressed) this.unpress();
    else this.press();

    return this;
  }
}
