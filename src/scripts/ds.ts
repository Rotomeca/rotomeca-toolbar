/**
 * Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages.
 *
 * Importé en tête de chaque script de page. Dépend de `@rotomeca/design-system`.
 */

// Enregistre tous les composants `rds-*` du design system @rotomeca/design-system.
// Les icônes (Lucide) sont chargées par nom depuis `out/icons/`, à côté du bundle.
// [rotomeca-design-system.js] # sourceMappingURL=rotomeca-design-system.js.map
import '../../node_modules/@rotomeca/design-system/out/rotomeca-design-system.js';

// Le thème (data-theme / data-palette) est posé sur <html> par le processus principal.
