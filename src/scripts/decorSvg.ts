/**
 * Chargement et préparation des SVG de décor des effets de saison et de moments.
 *
 * Utilisé par `seasonFx.ts` et `momentFx.ts`. Les SVG sont des fichiers locaux de `src/assets/decors/`,
 * chargés une seule fois ; leur racine est reposée pour choisir taille, classe et style.
 */

/** Adresse du dossier des SVG de décor. */
const DECORS = new URL('../assets/decors/', import.meta.url).href;
/** Espace de noms des éléments SVG. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Textes des SVG déjà demandés, pour ne les charger qu'une fois. */
const templates = new Map<string, Promise<string>>();

/**
 * Charge (une seule fois) le texte d'un SVG de décor.
 * @param name Nom du fichier, sans extension
 * @returns Le texte du SVG, vide si le chargement échoue
 */
export async function loadSvg(name: string): Promise<string> {
  if (!templates.has(name)) {
    templates.set(
      name,
      fetch(`${DECORS}${name}.svg`)
        .then((response) => response.text())
        .catch((error) => {
          console.error(`décor ${name}`, error);
          return '';
        }),
    );
  }

  return templates.get(name) ?? Promise.resolve('');
}

/**
 * Remplace la balise racine d'un SVG : on garde son viewBox, le reste est posé ici.
 * @param svg Texte du SVG d'origine
 * @param attributes Attributs de la nouvelle racine (classe, taille, style)
 * @returns Le SVG avec sa nouvelle racine
 */
export function withRoot(svg: string, attributes: string): string {
  const root = /<svg[^>]*>/.exec(svg)?.[0] ?? '';
  const viewBox = /viewBox="[^"]*"/.exec(root)?.[0] ?? '';
  const ratio = /preserveAspectRatio="[^"]*"/.exec(root)?.[0] ?? '';

  return svg.replace(root, `<svg xmlns="${SVG_NS}" ${viewBox} ${ratio} ${attributes}>`);
}

/** Pas du délai négatif entre deux tiges (balancement) ou deux touffes d'herbe, en secondes. */
const SWAY_DELAY_STEP = 0.41;
/** Pas du délai négatif entre deux têtes de fleur (piqué du nez), en secondes. */
const NOD_DELAY_STEP = 0.83;
/** Pas du délai négatif entre deux groupes seuls (touffes d'herbe), en secondes. */
const LONE_DELAY_STEP = 1.1;

/**
 * Anime un décor statique en posant des classes sur ses groupes `<g>` : une tige qui contient une
 * tête de fleur se balance (`mo-sway`), la tête pique du nez (`mo-nod`), un groupe seul reçoit `loneClass`.
 * Les délais sont décalés d'un groupe à l'autre pour que rien ne bouge en même temps.
 * @param svg Texte d'un SVG dont les groupes n'ont ni classe ni attribut
 * @param loneClass Classe des groupes sans groupe enfant (herbe, yeux), vide pour les laisser tels quels
 * @returns Le SVG avec ses classes d'animation
 */
export function animateGroups(svg: string, loneClass: string): string {
  const groups: { index: number; depth: number; hasChild: boolean }[] = [];
  const open: { hasChild: boolean }[] = [];

  for (const token of svg.matchAll(/<g>|<\/g>/g)) {
    if (token[0] === '</g>') {
      open.pop();
      continue;
    }

    const parent = open[open.length - 1];
    if (parent) parent.hasChild = true;

    const group = { index: token.index ?? 0, depth: open.length, hasChild: false };
    groups.push(group);
    open.push(group);
  }

  const classes = new Map<number, { cls: string; delay: number }>();
  let pair = 0;
  let lone = 0;

  for (const group of groups) {
    if (group.depth === 0 && group.hasChild) {
      classes.set(group.index, { cls: 'mo-sway', delay: -pair * SWAY_DELAY_STEP });
    } else if (group.depth === 1) {
      classes.set(group.index, { cls: 'mo-nod', delay: -pair * NOD_DELAY_STEP });
      pair++;
    } else if (loneClass) {
      classes.set(group.index, { cls: loneClass, delay: -lone++ * LONE_DELAY_STEP });
    }
  }

  return svg.replace(/<g>/g, (match, offset: number) => {
    const entry = classes.get(offset);
    return entry ? `<g class="${entry.cls}" style="animation-delay:${entry.delay.toFixed(2)}s">` : match;
  });
}
