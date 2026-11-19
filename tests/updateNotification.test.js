const test = require('node:test');
const assert = require('node:assert/strict');
const { showUpdateNotification } = require('../dist/src/main/updates/updateNotification.js');

/** Fausse classe Notification : mémorise les instances créées et leurs appels. */
function fakeNotificationClass(supported) {
  class FakeNotification {
    static instances = [];
    static isSupported() {
      return supported;
    }

    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.shown = false;
      FakeNotification.instances.push(this);
    }

    on(event, listener) {
      this.listeners[event] = listener;
    }

    show() {
      this.shown = true;
    }
  }
  return FakeNotification;
}

const translate = (key) => `traduit:${key}`;

test('showUpdateNotification : affiche une notification traduite avec l\'icône de l\'application', () => {
  const Notification = fakeNotificationClass(true);
  showUpdateNotification({ Notification, translate, iconPath: '/chemin/icon.png', onClick: () => {} });

  const [notification] = Notification.instances;
  assert.equal(notification.shown, true);
  assert.deepEqual(notification.options, {
    title: 'traduit:update.downloadedNotifTitle',
    body: 'traduit:update.downloadedNotifBody',
    icon: '/chemin/icon.png',
    urgency: 'normal',
  });
});

test('showUpdateNotification : le clic déclenche l\'action donnée', () => {
  const Notification = fakeNotificationClass(true);
  let clicks = 0;
  showUpdateNotification({ Notification, translate, iconPath: 'i.png', onClick: () => ++clicks });

  Notification.instances[0].listeners.click();
  assert.equal(clicks, 1);
});

test('showUpdateNotification : sans prise en charge des notifications, rien n\'est créé', () => {
  const Notification = fakeNotificationClass(false);
  showUpdateNotification({ Notification, translate, iconPath: 'i.png', onClick: () => {} });
  assert.equal(Notification.instances.length, 0);
});
