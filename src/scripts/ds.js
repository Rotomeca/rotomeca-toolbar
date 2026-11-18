import { applyTheme } from '../../node_modules/@rotomeca/design-system/out/rotomeca-design-system.js';

// Enregistre tous les composants `rds-*` du design system @rotomeca/design-system.
// Les icônes (Lucide) sont chargées par nom depuis `out/icons/`, à côté du bundle.
export * from '../../node_modules/@rotomeca/design-system/out/rotomeca-design-system.js';

// Clair ou sombre selon le système (suivi en direct). Les thèmes de couleur de
// l'application surchargent ensuite les jetons via ds-bridge.css.
applyTheme('system');
