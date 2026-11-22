/**
 * Moments de la journée et pluie : calques de ciel, de météo et de décor posés avec les effets de saison.
 *
 * Utilisé par `seasonFx.ts`. L'état vient de <html> (`data-moment`, `data-weather`), posé par le processus
 * principal. `planLayers` décide, sans toucher au DOM, ce qui est affiché ; les builders produisent le balisage.
 * Les animations sont dans `css/moments.css`. Les valeurs « aléatoires » sont déterministes (algorithme de la maquette).
 */
// [decorSvg.ts] Chargement et préparation des SVG de décor des effets de saison et de moments
import { animateGroups, loadSvg, withRoot } from './decorSvg.js';

/** Moments de la journée connus (`data-moment`). */
const MOMENTS = ['aube', 'jour', 'crepuscule', 'nuit'] as const;
/** Moment de la journée. */
export type Moment = (typeof MOMENTS)[number];

/** Ce que les pages savent du ciel : moment, pluie, et si les effets animés sont actifs. */
export interface SkyState {
  /** Moment de la journée ; absent hors thème automatique ou si « Moments et météo » est coupé. */
  readonly moment: Moment | undefined;
  /** Il pleut aujourd'hui. */
  readonly rainy: boolean;
  /** Les effets de saison (éléments animés) sont activés. */
  readonly effects: boolean;
}

/** Décor de pluie posé à la place de celui de la saison. */
export type RainDecor = 'clairiere' | 'terrier' | 'parterre';

/** Ce que l'on affiche pour une saison et un ciel donnés. */
export interface LayerPlan {
  /** Voile de ciel coloré (reste même si les effets sont coupés). */
  readonly sky: boolean;
  /** Voile gris et nuages de pluie. */
  readonly veil: boolean;
  /** Étoiles et lune. */
  readonly nightSky: boolean;
  /** Soleil bas (aube et crépuscule). */
  readonly lowSun: boolean;
  /** Brume du matin. */
  readonly mist: boolean;
  /** Gouttes de pluie. */
  readonly drops: boolean;
  /** Éclairs (pluie d'été). */
  readonly flash: boolean;
  /** Lucioles (nuit d'été, beau temps). */
  readonly fireflies: boolean;
  /** Décor de pluie, ou `null`. */
  readonly rainDecor: RainDecor | null;
  /** Soleil et rayons de l'été (journée, beau temps). */
  readonly summerSun: boolean;
  /** Tournesols de l'été (tous les moments, sauf sous la pluie). */
  readonly sunflowers: boolean;
  /** Décor habituel de la saison (renard, lapin…), caché quand le décor de pluie le remplace. */
  readonly seasonDecor: boolean;
  /** Nombre de particules de saison imposé par la pluie, `null` pour le nombre habituel. */
  readonly particleCount: number | null;
}

/** Décor de pluie par saison. */
const RAIN_DECORS: Readonly<Record<string, RainDecor>> = {
  ete: 'clairiere',
  automne: 'terrier',
  printemps: 'parterre',
};

/** Feuilles qui tombent encore sous la pluie d'automne. */
const AUTUMN_RAIN_LEAVES = 5;

/**
 * @param value Valeur lue sur <html>
 * @returns Le moment, ou `undefined` si la valeur est absente ou inconnue
 */
export function parseMoment(value: string | undefined): Moment | undefined {
  return MOMENTS.find((moment) => moment === value);
}

/**
 * Décide des calques à afficher (spec « Moments et météo », § 4 à 6).
 * @param kind Type d'animation de la saison (neige | automne | printemps | cerisier | ete | noel)
 * @param sky Moment, pluie et état des effets
 * @returns Le plan des calques ; sans moment, c'est le comportement habituel des saisons
 */
export function planLayers(kind: string, sky: SkyState): LayerPlan {
  const rainDecor = sky.rainy ? (RAIN_DECORS[kind] ?? null) : null;
  const rain = rainDecor !== null;
  const { moment } = sky;
  const isSummer = kind === 'ete';

  return {
    sky: moment !== undefined,
    veil: rain,
    nightSky: moment === 'nuit' && !rain,
    lowSun: (moment === 'aube' || moment === 'crepuscule') && !rain,
    mist: moment === 'aube',
    drops: rain,
    flash: rain && isSummer,
    fireflies: !rain && isSummer && moment === 'nuit',
    rainDecor,
    summerSun: isSummer && !rain && (moment === undefined || moment === 'jour'),
    sunflowers: !rain,
    seasonDecor: !rain,
    particleCount: rain ? (kind === 'automne' ? AUTUMN_RAIN_LEAVES : 0) : null,
  };
}

/**
 * @param n Rang de l'élément
 * @returns Valeur pseudo-aléatoire stable entre 0 et 1
 */
function rnd(n: number): number {
  const x = Math.sin(n * 91.7 + 3.3) * 43758.5453;
  return x - Math.floor(x);
}

/** Réglage de la pluie d'une saison : nombre de gouttes, durée de chute, longueur, opacité. */
interface RainSetting {
  readonly count: number;
  readonly durationBase: number;
  readonly durationRange: number;
  readonly lengthBase: number;
  readonly lengthRange: number;
  readonly opacity: number;
}

/** Pluie de chaque saison : plus dense et plus rapide en été, fine et lente au printemps. */
const RAIN: Readonly<Record<string, RainSetting>> = {
  ete: { count: 70, durationBase: 0.45, durationRange: 0.3, lengthBase: 18, lengthRange: 8, opacity: 0.8 },
  automne: { count: 42, durationBase: 0.7, durationRange: 0.4, lengthBase: 14, lengthRange: 6, opacity: 0.65 },
  printemps: { count: 26, durationBase: 1.0, durationRange: 0.5, lengthBase: 8, lengthRange: 4, opacity: 0.5 },
};

/**
 * @param kind Saison
 * @param narrow `true` pour la barre étroite, toujours visible : moitié moins de gouttes
 * @returns Le balisage des gouttes ; vide pour une saison sans pluie
 */
export function drops(kind: string, narrow: boolean): string {
  const setting = RAIN[kind];
  if (!setting) return '';

  const count = narrow ? Math.ceil(setting.count / 2) : setting.count;
  let html = '';

  for (let i = 0; i < count; i++) {
    const duration = setting.durationBase + rnd(i) * setting.durationRange;
    const length = Math.round(setting.lengthBase + rnd(i + 3) * setting.lengthRange);
    const opacity = (setting.opacity * (0.6 + rnd(i + 4) * 0.4)).toFixed(2);

    html +=
      `<span class="mo-drop" style="left:${(rnd(i + 1) * 104).toFixed(1)}%;animation-duration:${duration.toFixed(2)}s;` +
      `animation-delay:${(-rnd(i + 2) * duration).toFixed(2)}s"><i style="height:${length}px;opacity:${opacity}"></i></span>`;
  }

  return html;
}

/** @returns Le balisage des 22 étoiles de la moitié haute du ciel */
export function stars(): string {
  let html = '';

  for (let i = 0; i < 22; i++) {
    const size = (1.4 + rnd(i + 80) * 1.8).toFixed(1);
    html +=
      `<span class="mo-star" style="left:${(rnd(i + 40) * 96).toFixed(1)}%;top:${(rnd(i + 60) * 45).toFixed(1)}%;` +
      `width:${size}px;height:${size}px;animation-delay:${(-rnd(i + 90) * 2.2).toFixed(1)}s"></span>`;
  }

  return html;
}

/** @returns Le balisage des 9 lucioles de la moitié basse du ciel */
export function fireflies(): string {
  let html = '';

  for (let i = 0; i < 9; i++) {
    html +=
      `<span class="mo-firefly" style="left:${(10 + rnd(i + 120) * 80).toFixed(1)}%;top:${(50 + rnd(i + 130) * 38).toFixed(1)}%;` +
      `animation-delay:${(-rnd(i + 140) * 6).toFixed(1)}s;animation-duration:${(4 + rnd(i + 150) * 4).toFixed(1)}s"></span>`;
  }

  return html;
}

/**
 * @param narrow `true` pour la barre étroite : nuages réduits de moitié
 * @returns Le balisage des 5 nuages qui traversent le ciel de gauche à droite
 */
async function clouds(narrow: boolean): Promise<string> {
  const cloud = await loadSvg('nuage');
  let html = '';

  for (let i = 0; i < 5; i++) {
    const duration = 34 + rnd(i + 200) * 30;
    const scale = (0.8 + rnd(i + 210) * 0.9) * (narrow ? 0.5 : 1);
    const svg = withRoot(
      cloud,
      `width="${Math.round(150 * scale)}" height="${Math.round(80 * scale)}" style="opacity:${(0.7 + rnd(i + 240) * 0.3).toFixed(2)}"`,
    );

    html +=
      `<div class="mo-cloud-track" style="top:${(-8 + rnd(i + 220) * 22).toFixed(1)}%;animation-duration:${duration.toFixed(1)}s;` +
      `animation-delay:${(-rnd(i + 230) * duration).toFixed(1)}s">${svg}</div>`;
  }

  return html;
}

/**
 * Calques de l'arrière du décor : ciel, voile et nuages de pluie, étoiles et lune, soleil bas, brume.
 * @param plan Calques à afficher
 * @param narrow `true` pour la barre étroite
 * @returns Le balisage, à poser avant les effets de saison
 */
export async function backLayers(plan: LayerPlan, narrow: boolean): Promise<string> {
  let html = plan.sky ? '<div class="mo-sky"></div>' : '';

  if (plan.veil) html += `<div class="mo-veil"></div>${await clouds(narrow)}`;

  if (plan.nightSky) {
    const moon = await loadSvg('lune');
    html += stars() + withRoot(moon, `class="mo-moon" width="${narrow ? 40 : 64}" height="${narrow ? 40 : 64}"`);
  }

  if (plan.lowSun) {
    const size = narrow ? 72 : 120;
    html += withRoot(await loadSvg('soleil-bas'), `class="mo-lowsun" width="${size}" height="${size}"`);
  }

  if (plan.mist) {
    html += '<div class="mo-mist" style="bottom:18%"></div><div class="mo-mist" style="bottom:4%;animation-delay:-7s;opacity:0.8"></div>';
  }

  return html;
}

/**
 * Le décor de pluie, animé et dimensionné pour la barre étroite ou une grande fenêtre.
 * @param decor Décor à poser
 * @param narrow `true` pour la barre étroite
 * @returns Le balisage du SVG
 */
async function rainDecorSvg(decor: RainDecor, narrow: boolean): Promise<string> {
  switch (decor) {
    case 'clairiere':
      return withRoot(
        animateGroups(await loadSvg('clairiere-herbe'), 'mo-grass'),
        `class="fx-deco" style="left:0;right:0;bottom:-2px" width="100%" height="${narrow ? 60 : 92}" preserveAspectRatio="xMidYMax slice"`,
      );
    case 'terrier':
      return withRoot(
        animateGroups(await loadSvg('terrier'), 'mo-eyes'),
        `class="fx-deco" style="right:${narrow ? 6 : 14}px" width="${narrow ? 60 : 150}" height="${narrow ? 38 : 96}" preserveAspectRatio="xMidYMax meet"`,
      );
    case 'parterre':
      return withRoot(
        animateGroups(await loadSvg('parterre-tulipes'), ''),
        `class="fx-deco" style="right:${narrow ? 0 : 10}px" width="${narrow ? 72 : 200}" height="${narrow ? 45 : 125}" preserveAspectRatio="xMidYMax meet"`,
      );
  }
}

/**
 * Calques de l'avant du décor : gouttes, éclair, lucioles, puis le décor de pluie.
 * @param kind Saison
 * @param plan Calques à afficher
 * @param narrow `true` pour la barre étroite
 * @returns Le balisage, à poser après les effets de saison
 */
export async function frontLayers(kind: string, plan: LayerPlan, narrow: boolean): Promise<string> {
  let html = '';

  if (plan.drops) html += drops(kind, narrow);
  if (plan.flash) html += '<div class="mo-flash"></div>';
  if (plan.fireflies) html += fireflies();
  if (plan.rainDecor) html += await rainDecorSvg(plan.rainDecor, narrow);

  return html;
}
