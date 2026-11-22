const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Les modules des pages sont des modules ES (sans package.json voisin) : on les charge par import()
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'dist', file)).href);
const decor = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'decors', `${name}.svg`), 'utf8');
const sky = (overrides) => ({ moment: 'jour', rainy: false, effects: true, ...overrides });

// #region planLayers

test('planLayers : sans moment, le comportement des saisons ne change pas', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');
  const plan = planLayers('ete', sky({ moment: undefined }));
  assert.equal(plan.sky, false);
  assert.equal(plan.summerSun, true);
  assert.equal(plan.sunflowers, true);
  assert.equal(plan.seasonDecor, true);
  assert.equal(plan.particleCount, null);
  assert.equal(plan.nightSky || plan.lowSun || plan.mist || plan.drops, false);
});

test('planLayers : les rayons de l\'été n\'apparaissent qu\'en journée', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');
  assert.equal(planLayers('ete', sky({ moment: 'jour' })).summerSun, true);
  for (const moment of ['aube', 'crepuscule', 'nuit']) assert.equal(planLayers('ete', sky({ moment })).summerSun, false, moment);
  assert.equal(planLayers('ete', sky({ moment: 'nuit' })).sunflowers, true, 'les tournesols restent');
});

test('planLayers : étoiles et lune la nuit, soleil bas à l\'aube et au crépuscule, brume à l\'aube', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');
  assert.equal(planLayers('hiver', sky({ moment: 'nuit' })).nightSky, true);
  assert.equal(planLayers('hiver', sky({ moment: 'jour' })).nightSky, false);
  assert.equal(planLayers('hiver', sky({ moment: 'aube' })).lowSun, true);
  assert.equal(planLayers('hiver', sky({ moment: 'crepuscule' })).lowSun, true);
  assert.equal(planLayers('hiver', sky({ moment: 'nuit' })).lowSun, false);
  assert.equal(planLayers('hiver', sky({ moment: 'aube' })).mist, true);
  assert.equal(planLayers('hiver', sky({ moment: 'jour' })).mist, false);
});

test('planLayers : lucioles seulement la nuit d\'été, par beau temps', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');
  assert.equal(planLayers('ete', sky({ moment: 'nuit' })).fireflies, true);
  assert.equal(planLayers('ete', sky({ moment: 'nuit', rainy: true })).fireflies, false);
  assert.equal(planLayers('automne', sky({ moment: 'nuit' })).fireflies, false);
});

test('planLayers : la pluie remplace décors, soleil, étoiles et lune, mais garde la brume', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');

  const summer = planLayers('ete', sky({ rainy: true }));
  assert.equal(summer.rainDecor, 'clairiere');
  assert.equal(summer.flash, true);
  assert.equal(summer.sunflowers || summer.summerSun || summer.seasonDecor, false);
  assert.equal(summer.particleCount, 0);

  const autumn = planLayers('automne', sky({ rainy: true }));
  assert.equal(autumn.rainDecor, 'terrier');
  assert.equal(autumn.flash, false);
  assert.equal(autumn.seasonDecor, false);
  assert.equal(autumn.particleCount, 5);

  assert.equal(planLayers('printemps', sky({ rainy: true })).rainDecor, 'parterre');

  const night = planLayers('printemps', sky({ moment: 'nuit', rainy: true }));
  assert.equal(night.nightSky, false);
  assert.equal(night.veil, true);
  assert.equal(planLayers('printemps', sky({ moment: 'aube', rainy: true })).mist, true);
});

test('planLayers : une saison sans pluie ignore un jour de pluie', async () => {
  const { planLayers } = await load('src/scripts/momentFx.js');
  for (const kind of ['neige', 'noel', 'cerisier']) {
    const plan = planLayers(kind, sky({ rainy: true }));
    assert.equal(plan.drops || plan.veil || plan.rainDecor !== null, false, kind);
    assert.equal(plan.seasonDecor, true, kind);
  }
});

test('parseMoment : seules les quatre valeurs connues passent', async () => {
  const { parseMoment } = await load('src/scripts/momentFx.js');
  assert.equal(parseMoment('nuit'), 'nuit');
  assert.equal(parseMoment('minuit'), undefined);
  assert.equal(parseMoment(undefined), undefined);
});

// #endregion

// #region Balisage

test('drops : nombre de gouttes par saison, moitié sur la barre étroite', async () => {
  const { drops } = await load('src/scripts/momentFx.js');
  const count = (html) => (html.match(/class="mo-drop"/g) ?? []).length;
  assert.equal(count(drops('ete', false)), 70);
  assert.equal(count(drops('automne', false)), 42);
  assert.equal(count(drops('printemps', false)), 26);
  assert.equal(count(drops('ete', true)), 35);
  assert.equal(drops('hiver', false), '');
});

test('stars et fireflies : 22 étoiles, 9 lucioles', async () => {
  const { stars, fireflies } = await load('src/scripts/momentFx.js');
  assert.equal(stars().match(/class="mo-star"/g).length, 22);
  assert.equal(fireflies().match(/class="mo-firefly"/g).length, 9);
});

// #endregion

// #region animateGroups

test('animateGroups : le parterre de tulipes se balance et pique du nez, tige par tige', async () => {
  const { animateGroups } = await load('src/scripts/decorSvg.js');
  const svg = animateGroups(decor('parterre-tulipes'), '');
  const sways = svg.match(/class="mo-sway"/g).length;
  assert.equal(sways, 16);
  assert.equal(svg.match(/class="mo-nod"/g).length, sways);
  assert.doesNotMatch(svg, /<g>/);
  assert.notEqual(svg.match(/mo-sway" style="animation-delay:([^"]*)/)[1], svg.match(/mo-sway" style="animation-delay:[^"]*"[\s\S]*?mo-sway" style="animation-delay:([^"]*)/)[1]);
});

test('animateGroups : la clairière a de l\'herbe qui ondule et des fleurs qui se balancent', async () => {
  const { animateGroups } = await load('src/scripts/decorSvg.js');
  const svg = animateGroups(decor('clairiere-herbe'), 'mo-grass');
  assert.equal(svg.match(/class="mo-grass"/g).length, 3);
  assert.equal(svg.match(/class="mo-sway"/g).length, 7);
  assert.equal(svg.match(/class="mo-nod"/g).length, 7);
});

test('animateGroups : le terrier montre ses yeux', async () => {
  const { animateGroups } = await load('src/scripts/decorSvg.js');
  assert.equal(animateGroups(decor('terrier'), 'mo-eyes').match(/class="mo-eyes"/g).length, 1);
});

// #endregion
