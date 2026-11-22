/**
 * Effets de saison : calque décoratif (neige, feuilles, pétales, soleil, cadeaux) posé dans un élément.
 *
 * Utilisé par la page de la barre et celle des paramètres. Dépend des SVG de `src/assets/decors/`
 * et de `css/saisons.css` pour les animations. Le calque suit le thème de saison courant.
 *
 * L'état vient de <html> : `data-palette` (le thème), `data-moment` et `data-weather` (moment de la
 * journée et pluie, voir `momentFx.ts`), `data-fx` (« on » si les effets sont
 * actifs) et `data-fx-density` (discrete | normale | abondante), posés par le processus
 * principal. Les animations sont dans `css/saisons.css`, qui les coupe si Windows réduit
 * les animations. Les valeurs « aléatoires » sont déterministes (algorithme des maquettes).
 */

// [decorSvg.ts] Chargement et préparation des SVG de décor des effets de saison et de moments
import { loadSvg, withRoot } from './decorSvg.js';
// [momentFx.ts] Moments de la journée et pluie : calques de ciel, de météo et de décor
import { backLayers, frontLayers, parseMoment, planLayers } from './momentFx.js';
import type { SkyState } from './momentFx.js';

/** Nombre de particules par densité : [barre étroite, grande fenêtre]. */
const COUNTS: Readonly<Record<string, readonly [number, number]>> = {
  discrete: [6, 12],
  normale: [12, 22],
  abondante: [20, 34],
};

/** Type d'animation de chaque palette de saison. */
const KINDS: Readonly<Record<string, string>> = {
  hiver: 'neige',
  automne: 'automne',
  printemps: 'printemps',
  cerisier: 'cerisier',
  ete: 'ete',
  'ete-nuit': 'ete',
  noel: 'noel',
};

/** Couleurs des feuilles ou pétales qui tombent, par saison. */
const LEAF_COLORS: Readonly<Record<string, readonly string[]>> = {
  automne: ['#e07a3a', '#c9452c', '#d4a95a', '#8e2a1e'],
  printemps: ['#7fc28f', '#4f9a62', '#a8d8a0', '#3f8a55'],
  cerisier: ['#f7c1d0', '#f2a7bd', '#fbd9e3', '#e88aa8'],
};

/** Couleurs des paquets cadeaux de la pluie de Noël. */
const GIFT_BOXES = ['#d62839', '#f2c14e', '#1e8a4c', '#ffffff', '#c0392b', '#2e7d32'];

/** Décor posé en bas à droite d'une saison. */
interface Decoration {
  /** Nom du fichier SVG, sans extension. */
  readonly file: string;
  /** Largeur et hauteur dans une grande fenêtre. */
  readonly wide: readonly [number, number];
  /** Largeur et hauteur dans la barre étroite. */
  readonly narrow: readonly [number, number];
  /** Classe CSS d'animation du décor, vide s'il n'en a pas. */
  readonly cls: string;
}

/** Décor de chaque saison. */
const DECO: Readonly<Record<string, Decoration>> = {
  neige: { file: 'bonhomme-de-neige', wide: [84, 104], narrow: [44, 56], cls: 'fx-wobble' },
  automne: { file: 'renard', wide: [84, 104], narrow: [44, 56], cls: '' },
  printemps: { file: 'lapin', wide: [84, 104], narrow: [44, 56], cls: '' },
  cerisier: { file: 'cerf-nara', wide: [86, 118], narrow: [44, 60], cls: '' },
  noel: { file: 'sapin', wide: [84, 104], narrow: [44, 56], cls: '' },
};

/** Tournesols de l'été : [position gauche, largeur, hauteur, délai] */
type Sunflower = readonly [left: string, width: number, height: number, delay: string];

/** Emplacement des tournesols de l'été, selon la taille de l'hôte. */
const SUNFLOWERS: Readonly<Record<'wide' | 'narrow', readonly Sunflower[]>> = {
  wide: [
    ['calc(100% - 170px)', 58, 99, '-1.4s'],
    ['calc(100% - 128px)', 76, 129, '0s'],
    ['calc(100% - 72px)', 84, 143, '-2.6s'],
  ],
  narrow: [['16px', 40, 68, '0s']],
};

/**
 * Génère une valeur pseudo-aléatoire stable : le même rang donne toujours le même résultat.
 * @param {number} n Rang de la particule
 * @returns {number} Valeur pseudo-aléatoire stable entre 0 et 1
 */
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Variante de `rnd` pour la pluie de cadeaux, avec d'autres constantes.
 * @param n Rang du cadeau
 * @returns Valeur pseudo-aléatoire stable entre 0 et 1
 */
function rndGift(n: number): number {
  const x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Particules qui tombent : neige, feuilles ou pétales.
 * @param kind Saison ; une saison sans particules donne une chaîne vide
 * @param count Nombre de particules
 * @returns {string} Balisage
 */
function particles(kind: string, count: number): string {
  if (!['neige', 'automne', 'printemps', 'cerisier'].includes(kind)) return '';

  const snow = kind === 'neige';
  const palette = LEAF_COLORS[kind] ?? [];
  let html = '';

  for (let i = 0; i < count; i++) {
    const duration = snow ? 7 + rnd(i + 3) * 6 : 9 + rnd(i + 3) * 7;
    const size = snow ? 3 + Math.round(rnd(i + 7) * 4) : 13 + Math.round(rnd(i + 7) * 9);
    const opacity = (0.55 + rnd(i + 23) * 0.45).toFixed(2);
    const color = palette.length ? palette[Math.floor(rnd(i + 29) * palette.length)] : '#ffffff';

    let content;
    if (snow)
      content = `<span class="fx-snow" style="width:${size}px;height:${size}px;opacity:${opacity}"></span>`;
    else if (kind === 'cerisier')
      content = `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 21C6 15 5 9 8 4c1.5 1.5 2.7 2 4 1 1.3 1 2.5.5 4-1 3 5 2 11-4 17z" fill="${color}"></path></svg>`;
    else
      content = `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2C7 7 5 11 5 14.5a7 7 0 0 0 14 0C19 11 17 7 12 2z" fill="${color}"></path><path d="M12 6.5V22" stroke="#1b1613" stroke-opacity="0.3" stroke-width="1.2" fill="none"></path></svg>`;

    html +=
      `<span class="fx-p${snow ? '' : ' fx-wind'}" style="left:${(rnd(i + 1) * 100).toFixed(1)}%;` +
      `animation-duration:${duration.toFixed(1)}s;animation-delay:${(-rnd(i + 11) * duration).toFixed(1)}s">` +
      `<span class="fx-in" style="animation-duration:${(2.2 + rnd(i + 17) * 2.4).toFixed(1)}s">${content}</span></span>`;
  }

  return html;
}

/**
 * Soleil en haut à gauche et rayons qui pulsent (été).
 * @param narrow `true` pour l'hôte étroit (la barre)
 * @returns Balisage
 */
function sun(narrow: boolean): string {
  const angles = narrow ? [64, 71, 78, 85] : [20, 29, 38, 47, 56];
  const size = narrow ? 64 : 110;

  const rays = angles
    .map((angle, i) => {
      const height = (narrow ? 10 : 18 + (i % 2) * 14) + 'px';
      const delay = (-i * 0.9).toFixed(1) + 's';
      const duration = (3 + (i % 3) * 0.8).toFixed(1) + 's';
      return `<span class="fx-ray-rot" style="transform:rotate(${angle}deg)"><span class="fx-ray" style="height:${height};animation-delay:${delay};animation-duration:${duration}"></span></span>`;
    })
    .join('');

  return (
    `<div class="fx-rays">${rays}</div>` +
    `<svg class="fx-sunball" width="${size}" height="${size}" viewBox="0 0 100 100"><circle class="fx-halo" cx="50" cy="50" r="48" fill="#ffd23f"></circle><circle cx="50" cy="50" r="32" fill="#ffc21a"></circle><circle cx="50" cy="50" r="26" fill="#ffd84d"></circle></svg>`
  );
}

/**
 * Pluie de cadeaux : chacun tombe quand la hotte du traîneau passe au-dessus de lui.
 * @param count Nombre de cadeaux
 * @returns Balisage
 */
function gifts(count: number): string {
  let html = '';

  for (let i = 0; i < count; i++) {
    const left = 8 + (84 * (i + 0.5)) / count + (rndGift(i) - 0.5) * 6;
    // Délais positifs, pour rester synchronisés avec le traîneau
    const delay = (4.8 * (left - 8 + 72)) / 174;
    const spin = (1.4 + rndGift(i + 5) * 1.6).toFixed(1);
    const size = 12 + Math.round(rndGift(i + 9) * 6);
    const box = GIFT_BOXES[i % GIFT_BOXES.length];
    const ribbon = box === '#f2c14e' ? '#d62839' : '#f2c14e';

    html +=
      `<span class="fx-gift" style="left:${left.toFixed(1)}%;animation-delay:${delay.toFixed(2)}s">` +
      `<span class="fx-spin" style="animation-duration:${spin}s"><svg width="${size}" height="${size}" viewBox="0 0 20 20">` +
      `<rect x="2" y="7" width="16" height="11" rx="1.5" fill="${box}"></rect><rect x="1" y="4.5" width="18" height="4" rx="1" fill="${box}"></rect>` +
      `<rect x="9" y="4.5" width="2" height="13.5" fill="${ribbon}"></rect>` +
      `<path d="M10 4.5C7 0.5 4 2.5 6.5 4.5M10 4.5C13 0.5 16 2.5 13.5 4.5" stroke="${ribbon}" stroke-width="1.6" fill="none"></path></svg></span></span>`;
  }

  return html;
}

/**
 * Construit le contenu du calque pour une saison.
 * @param kind neige | automne | printemps | cerisier | ete | noel
 * @param density Densité des particules
 * @param narrow Hôte étroit (la barre)
 * @param sky Moment, pluie et état des effets ; sans effets, seul le voile de ciel est construit
 * @returns Le balisage du calque
 */
async function build(kind: string, density: string, narrow: boolean, sky: SkyState): Promise<string> {
  const plan = planLayers(kind, sky);
  if (!sky.effects) return backLayers({ ...plan, veil: false, nightSky: false, lowSun: false, mist: false }, narrow);

  const [narrowCount, wideCount] = COUNTS[density] ?? COUNTS['normale'] ?? [0, 0];
  const count = plan.particleCount ?? (narrow ? narrowCount : wideCount);
  let html = (await backLayers(plan, narrow)) + particles(kind, count);

  if (kind === 'ete') {
    if (plan.sunflowers) {
      const flower = await loadSvg('tournesol');
      for (const [left, width, height, delay] of SUNFLOWERS[narrow ? 'narrow' : 'wide'])
        html += withRoot(
          flower,
          `class="fx-sun" style="left:${left};animation-delay:${delay}" width="${width}" height="${height}"`,
        );
    }
    if (plan.summerSun) html += sun(narrow);
  }

  if (kind === 'noel') {
    const sleigh = await loadSvg('traineau-pere-noel');
    html += `<div class="fx-santa">${withRoot(sleigh, '')}</div>`;
    html += gifts(narrow ? Math.max(3, Math.round(count / 3)) : Math.round(count / 2.5));
  }

  const deco = DECO[kind];
  if (deco && plan.seasonDecor) {
    const [width, height] = narrow ? deco.narrow : deco.wide;
    const svg = await loadSvg(deco.file);
    html += withRoot(
      svg,
      `class="fx-deco ${deco.cls}" style="right:${narrow ? 14 : 16}px" width="${width}" height="${height}"`,
    );
  }

  return html + (await frontLayers(kind, plan, narrow));
}

/**
 * Pose les effets de saison dans un élément hôte et les met à jour quand le thème,
 * l'interrupteur ou la densité changent.
 * @param {HTMLElement} host Élément hôte (devient `.fx-host`)
 * @param {{narrow?: boolean}} [options] `narrow` pour la barre de 72 px
 */
export function initSeasonFx(host: HTMLElement, { narrow = false }: { narrow?: boolean } = {}): void {
  host.classList.add('fx-host');
  host.classList.toggle('fx-narrow', narrow);

  const root = document.documentElement;
  let current = '';
  let version = 0;

  /** Recalcule le calque d'après le thème, le moment, la pluie, l'interrupteur et la densité ; ignore un résultat périmé. */
  const refresh = async () => {
    const palette = root.dataset.palette ?? '';
    const kind = KINDS[palette];
    const sky: SkyState = {
      moment: parseMoment(root.dataset.moment),
      rainy: root.dataset.weather === 'pluie',
      effects: root.dataset.fx === 'on',
    };
    // Sans effets, le voile de ciel d'un moment reste : seuls les éléments animés disparaissent
    const active = kind !== undefined && (sky.effects || sky.moment !== undefined);
    const density = root.dataset.fxDensity ?? 'normale';
    const key = active ? `${palette}|${density}|${sky.moment ?? ''}|${sky.rainy}|${sky.effects}` : '';

    if (key === current) return;
    current = key;

    const mine = ++version;
    const html = active ? await build(kind, density, narrow, sky) : '';
    // Un changement plus récent est arrivé pendant le chargement des décors
    if (mine !== version) return;

    host.querySelector(':scope > .fx')?.remove();
    if (!active) return;

    const layer = document.createElement('div');
    layer.className = 'fx';
    layer.setAttribute('aria-hidden', 'true');
    // Décors locaux uniquement ; l'analyse ne lance aucun script, contrairement à `innerHTML`
    layer.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
    host.prepend(layer);
  };

  new MutationObserver(refresh).observe(root, {
    attributes: true,
    attributeFilter: ['data-palette', 'data-moment', 'data-weather', 'data-fx', 'data-fx-density'],
  });
  refresh();
}
