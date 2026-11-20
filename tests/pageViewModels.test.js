const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Les modules des pages sont des modules ES (sans package.json voisin) : on les charge par import()
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'dist', file)).href);

const t = (key, vars = {}) => {
  const values = Object.entries(vars).map(([name, value]) => `${name}=${value}`).join(',');
  return values ? `${key}(${values})` : key;
};

// #region appForm

test('withProtocol : ajoute http:// seulement quand il manque', async () => {
  const { withProtocol } = await load('src/scripts/appForm.js');
  assert.equal(withProtocol('exemple.fr'), 'http://exemple.fr');
  assert.equal(withProtocol('https://exemple.fr'), 'https://exemple.fr');
  assert.equal(withProtocol(''), '');
});

test('suggestedName : premier élément du domaine, sans www., en majuscule', async () => {
  const { suggestedName } = await load('src/scripts/appForm.js');
  assert.equal(suggestedName('https://www.exemple.fr/page'), 'Exemple');
  assert.equal(suggestedName('http://mail.google.com'), 'Mail');
  assert.equal(suggestedName('http://'), '');
  assert.equal(suggestedName(''), '');
});

test('chosenName : le nom saisi, sinon le nom proposé, sinon l\'adresse', async () => {
  const { chosenName } = await load('src/scripts/appForm.js');
  assert.equal(chosenName('Mon site', 'https://exemple.fr'), 'Mon site');
  assert.equal(chosenName('', 'https://www.exemple.fr'), 'Exemple');
  assert.equal(chosenName('', 'http://'), 'http://');
});

test('normalizeUrl : sans barre finale ni ancre, comparable', async () => {
  const { normalizeUrl } = await load('src/scripts/appForm.js');
  assert.equal(normalizeUrl('https://a.fr/'), normalizeUrl('https://a.fr'));
  assert.equal(normalizeUrl('https://a.fr/x/#ancre'), 'https://a.fr/x');
  assert.equal(normalizeUrl('https://a.fr/x?q=1'), 'https://a.fr/x?q=1');
  assert.equal(normalizeUrl('pas une url'), 'pas une url');
});

// #endregion

// #region themeCatalog

test('themeCatalog : chaque thème des familles a un aperçu et un libellé', async () => {
  const { THEME_FAMILIES, THEME_PREVIEWS, THEME_LABELS, themesOf } = await load('src/page.settings/themeCatalog.js');
  for (const family of Object.values(THEME_FAMILIES)) {
    for (const entry of family.entries) {
      assert.ok(THEME_LABELS[entry.name], `libellé de ${entry.name}`);
      for (const theme of themesOf(entry)) {
        if (theme !== 'system') assert.ok(THEME_PREVIEWS[theme], `aperçu de ${theme}`);
      }
    }
  }
});

test('themeCatalog : les thèmes proposés sont exactement ceux que le processus principal accepte', async () => {
  const { THEME_FAMILIES, themesOf } = await load('src/page.settings/themeCatalog.js');
  const { THEMES } = require('../dist/src/main/settings/themes.js');
  const offered = Object.values(THEME_FAMILIES).flatMap((f) => f.entries.flatMap(themesOf)).sort();
  assert.deepEqual(offered, [...THEMES].sort());
});

test('themeCatalog : familyOf retrouve la famille, « base » à défaut', async () => {
  const { familyOf } = await load('src/page.settings/themeCatalog.js');
  assert.equal(familyOf('sombre'), 'base');
  assert.equal(familyOf('sapin'), 'colors');
  assert.equal(familyOf('noel'), 'seasons');
  assert.equal(familyOf('ete'), 'seasons');
  assert.equal(familyOf('inconnu'), 'base');
});

test('themeCatalog : themesOf donne les variantes ou le thème lui-même', async () => {
  const { themesOf } = await load('src/page.settings/themeCatalog.js');
  assert.deepEqual(themesOf({ name: 'rouge' }), ['rouge']);
  assert.deepEqual(themesOf({ name: 'vert', variants: [{ label: 'a', theme: 'vert' }, { label: 'b', theme: 'sapin' }] }), ['vert', 'sapin']);
});

// #endregion

// #region updateCard

const state = (overrides) => ({
  etat: 'uptodate', verification: false, versionActuelle: '3.4.1', prerelease: false, versionDisponible: null,
  pourcentage: null, derniereVerification: null, erreur: null, verificationTest: false, versionTest: null,
  derniereVerificationTest: null, erreurTest: null, testAuto: false, ...overrides,
});
const NOW = 10_000_000;

test('describeLastCheck : maintenant, minutes, heures, jamais', async () => {
  const { describeLastCheck } = await load('src/page.settings/updateCard.js');
  assert.equal(describeLastCheck(null, NOW, t), null);
  assert.equal(describeLastCheck(NOW - 10_000, NOW, t), 'update.card.lastNow');
  assert.equal(describeLastCheck(NOW - 5 * 60_000, NOW, t), 'update.card.lastMinutes(n=5)');
  assert.equal(describeLastCheck(NOW - 150 * 60_000, NOW, t), 'update.card.lastHours(n=2)');
  assert.equal(describeLastCheck(NOW + 60_000, NOW, t), 'update.card.lastNow', 'une horloge en avance n\'est pas négative');
});

test('describeUpdateCard : à jour, jamais vérifié', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const view = describeUpdateCard(state({}), NOW, t);
  assert.equal(view.icon, 'circle-check');
  assert.equal(view.title, 'update.card.titleUpToDate(version=3.4.1)');
  assert.equal(view.status, 'update.card.statusNeverChecked');
  assert.deepEqual([view.showCheckButton, view.showInstallButton, view.downloading], [true, false, false]);
});

test('describeUpdateCard : à jour, vérifié il y a quelques minutes', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const view = describeUpdateCard(state({ derniereVerification: NOW - 120_000 }), NOW, t);
  assert.equal(view.status, 'update.card.statusUpToDate(last=update.card.lastMinutes(n=2))');
});

test('describeUpdateCard : une pré-version n\'est pas « à jour »', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const view = describeUpdateCard(state({ prerelease: true, versionActuelle: '3.5.0-rc1' }), NOW, t);
  assert.equal(view.title, 'update.card.titlePrerelease(version=3.5.0-rc1)');
  assert.equal(view.status, 'update.card.statusPrerelease');
  assert.equal(view.showPrereleaseBadge, true);
});

test('describeUpdateCard : version disponible, on propose le téléchargement', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const view = describeUpdateCard(state({ etat: 'available', versionDisponible: '3.5.0' }), NOW, t);
  assert.equal(view.title, 'update.card.titleAvailable(version=3.5.0)');
  assert.deepEqual([view.showCheckButton, view.showInstallButton, view.installLabel, view.installIcon], [false, true, 'update.card.download', 'download']);
});

test('describeUpdateCard : prête, on propose l\'installation', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const view = describeUpdateCard(state({ etat: 'ready', versionDisponible: '3.5.0' }), NOW, t);
  assert.equal(view.status, 'update.card.statusReady');
  assert.deepEqual([view.installLabel, view.installIcon], ['update.card.install', 'refresh-cw']);
});

test('describeUpdateCard : téléchargement avec ou sans pourcentage, sans statut', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const withPercent = describeUpdateCard(state({ etat: 'downloading', versionDisponible: '3.5.0', pourcentage: 40 }), NOW, t);
  assert.deepEqual([withPercent.downloading, withPercent.progress, withPercent.status], [true, 40, '']);
  assert.equal(withPercent.progressLabel, 'update.card.progressLabel(version=3.5.0)');
  const indeterminate = describeUpdateCard(state({ etat: 'downloading' }), NOW, t);
  assert.equal(indeterminate.progress, null);
  assert.equal(indeterminate.progressLabel, 'update.card.progressLabelUnknown');
});

test('describeUpdateCard : une erreur remplace le statut, sauf pendant un téléchargement', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  const failed = describeUpdateCard(state({ erreur: 'update.error.network' }), NOW, t);
  assert.deepEqual([failed.status, failed.statusIsError], ['update.error.network', true]);
  const downloading = describeUpdateCard(state({ etat: 'downloading', erreur: 'update.error.network' }), NOW, t);
  assert.deepEqual([downloading.status, downloading.statusIsError], ['', false]);
});

test('describeUpdateCard : la vérification en cours est signalée', async () => {
  const { describeUpdateCard } = await load('src/page.settings/updateCard.js');
  assert.equal(describeUpdateCard(state({ verification: true }), NOW, t).checking, true);
});

test('describeTestChannel : rien de trouvé, rien d\'affiché', async () => {
  const { describeTestChannel } = await load('src/page.settings/updateCard.js');
  const view = describeTestChannel(state({}), t);
  assert.deepEqual([view.showOpenButton, view.status, view.statusIsError], [false, '', false]);
});

test('describeTestChannel : une recherche sans résultat le dit', async () => {
  const { describeTestChannel } = await load('src/page.settings/updateCard.js');
  assert.equal(describeTestChannel(state({ derniereVerificationTest: NOW }), t).status, 'update.test.none');
});

test('describeTestChannel : une version trouvée, installation automatique ou ouverture de la page', async () => {
  const { describeTestChannel } = await load('src/page.settings/updateCard.js');
  const auto = describeTestChannel(state({ versionTest: '3.5.0-rc1', testAuto: true }), t);
  assert.deepEqual([auto.showOpenButton, auto.openLabel, auto.status], [true, 'update.test.install(version=3.5.0-rc1)', 'update.test.found(version=3.5.0-rc1)']);
  const manual = describeTestChannel(state({ versionTest: '3.5.0-rc1' }), t);
  assert.equal(manual.openLabel, 'update.test.open(version=3.5.0-rc1)');
});

test('describeTestChannel : le bouton se cache pendant un téléchargement ou une installation prête', async () => {
  const { describeTestChannel } = await load('src/page.settings/updateCard.js');
  for (const etat of ['downloading', 'ready']) {
    assert.equal(describeTestChannel(state({ versionTest: '3.5.0-rc1', etat }), t).showOpenButton, false, etat);
  }
});

test('describeTestChannel : une erreur est affichée comme telle', async () => {
  const { describeTestChannel } = await load('src/page.settings/updateCard.js');
  const view = describeTestChannel(state({ erreurTest: 'update.test.error' }), t);
  assert.deepEqual([view.status, view.statusIsError], ['update.test.error', true]);
});

// #endregion

// #region ToolbarAppData, updateLevel

test('ToolbarAppData : racine du site pour le favicon', async () => {
  const { ToolbarAppData } = await load('src/scripts/ToolbarAppData.js');
  assert.equal(new ToolbarAppData('https://exemple.fr/a/b?c=1', 'T', null).path, 'https://exemple.fr');
  assert.equal(new ToolbarAppData('http://localhost:3000/x', 'T', null).path, 'http://localhost:3000');
  assert.equal(new ToolbarAppData('pas-une-url', 'T', null).path, 'pas-une-url');
});

test('ToolbarAppData : hasPicture', async () => {
  const { ToolbarAppData } = await load('src/scripts/ToolbarAppData.js');
  assert.equal(new ToolbarAppData('https://a.fr', 'T', 'font:mail').hasPicture(), true);
  assert.equal(new ToolbarAppData('https://a.fr', 'T', null).hasPicture(), false);
  assert.equal(new ToolbarAppData('https://a.fr', 'T', '').hasPicture(), false);
});

test('updateLevelOf : partagé entre la page et la zone de notification', async () => {
  const { updateLevelOf } = await load('src/shared/updateLevel.js');
  assert.equal(updateLevelOf('ready'), 'ready');
  assert.equal(updateLevelOf('available'), 'pending');
  assert.equal(updateLevelOf('downloading'), 'pending');
  assert.equal(updateLevelOf('uptodate'), null);
  assert.equal(updateLevelOf(undefined), null);
});

// #endregion
