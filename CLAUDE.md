# Rotomeca Toolbar

Barre d'outils Electron ancrée au bord gauche de l'écran, qui lance des sites web comme des applications en arrière-plan. Langue du projet : **français** (UI, README, docs, réponses). Plateformes : **Windows et Linux uniquement** : ne rien proposer ni faire pour macOS.

## Règles du claude-config

Règles générales importées depuis `.claude/claude-config/` (copie locale de `claude-infos/claude-config`, non versionnée, voir « Fichiers locaux »). Chaque fichier se lit dans son intégralité.

- @.claude/claude-config/docs/general/principles.md
- @.claude/claude-config/docs/general/clean-code.md
- @.claude/claude-config/docs/general/clean-architecture.md
- @.claude/claude-config/docs/general/git-and-reviews.md
- @.claude/claude-config/docs/general/security.md
- @.claude/claude-config/docs/general/testing.md
- @.claude/claude-config/docs/languages/javascript-typescript.md

**En cas de conflit, ce fichier prime** : les écarts ci-dessous sont voulus.

## Écarts avec le claude-config

- **JavaScript, pas TypeScript.** Typer avec JSDoc (`@param`, `@returns`, `@typedef`). `any` et `strict` ne s'appliquent pas.
- **CommonJS dans le processus principal** (`main.js`, `src/scripts/`, `configs/`) : `require` / `module.exports`. **ESM uniquement dans les pages** (`src/page.*/`) : `import`. Ne pas mélanger.
- **Commits : gitmoji en code, pas en emoji Unicode** (`:sparkles:`, pas ✨), car `cliff.toml` retire les `:codes:` pour générer le changelog (un emoji Unicode le polluerait). Le reste du format du claude-config s'applique (`type(scope): :gitmoji: description`, un commit = un changement atomique). Messages **en anglais**, au présent, comme tout l'historique.
- **Pas de PR ni de ticket** : le flux est un git flow local (voir le README). Le format de titre de PR du claude-config ne s'applique pas.
- **Style existant avant le `.prettierrc.json`.** Le code est en 2 espaces et fonctions fléchées avec parenthèses (`(x) => …`) ; le `.prettierrc.json` (tabulations, `arrowParens: avoid`) ne correspond pas et n'est pas appliqué. Suivre le fichier modifié, ne jamais reformater un fichier existant.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm start` | Lance l'app (electron-forge) |
| `pnpm debug` | Lance l'app en mode développement (`scripts/dev.js`) |
| `pnpm lint` | ESLint (`main.js`, `src`, `scripts`, `tests`, configs) |
| `pnpm test` | Tests `node:test` (`tests/*.test.js`) |
| `pnpm pre-release X.Y.Z [--push] [--dry-run]` | Crée une pré-version `X.Y.Z-rcN` |
| `pnpm make` | Construit les installeurs |

Avant de commiter : `pnpm lint` et `pnpm test` doivent passer. Le CI les exécute et bloque la release s'ils échouent.

## Architecture

- `main.js` : processus principal (`AppMain`), volumineux (≈2 100 lignes) et à découper progressivement.
- `src/scripts/` : classes et modules du processus principal. `preload.js` : liste blanche des canaux IPC. `src/page.*/` : une fenêtre par dossier (HTML + JS). `lib/` : composants partagés. `src/locales/{fr,en}.json` : textes. `configs/appConfig.js` : adresses des serveurs de mises à jour.
- **Logique testable = module pur, sans `electron`.** Les dépendances (fetch, dialogue, Squirrel…) sont injectées. C'est le principe d'inversion de dépendance du claude-config appliqué ici (exemples : `UpdateManager`, `PermissionStore`, `permissionPolicy`, `versions`, `safeUrl`, `appIcon`). `main.js` ne fait que câbler. **En touchant à `main.js`, extraire plutôt qu'ajouter**, et tester le module extrait.
- **Nouveau canal IPC** : l'ajouter aux trois listes `src/scripts/events/AppEventList.js`, `AppEventListBase.js` et `AppEventListModule.js` (les garder identiques) **et** à `INVOKE_CHANNELS` / `ON_CHANNELS` de `preload.js`, sinon le renderer ne le voit pas.
- **Textes** : toute chaîne visible va dans `fr.json` **et** `en.json`, avec les mêmes clés.

## Sécurité (en plus de `security.md`)

- Toute fenêtre ou vue, explicitement : `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. Pas encore explicités (ils reposent sur le défaut d'Electron, déjà sûr) : le menu contextuel (`RotomecaElectronContextMenu`) et la vue d'en-tête des apps.
- L'IPC n'est accepté que depuis la page principale d'une fenêtre locale `file://` (`BaseAppObject.addEventListener`).
- Contenu des sites tiers : jamais de `innerHTML` (utiliser `textContent`), URL passées par `isSafeUrl`, popups et navigation restreintes (`HardenWebContents`), permissions via `PermissionStore` / `permissionPolicy`.
- Une URL de release GitHub n'est ouverte que si elle appartient au dépôt (`readRelease`).

## Git et publication

- Git flow : `feature/`, `release/`, `hotfix/` + **`pre-release/X.Y.Z-rcN`** (créée par `pnpm pre-release`, jamais fusionnée dans `main`). Tags sans préfixe `v`.
- **Terminer une feature : `git flow feature finish <nom>` sans `--squash`** (préférence du mainteneur, contrairement à ce que dit le README), et **seulement sur demande**. Avec `GIT_MERGE_AUTOEDIT=no` pour éviter l'éditeur.
- **Ne jamais pousser, tagger ni publier sans demande explicite.** Un tag `X.Y.Z` publie directement une release proposée à tous les utilisateurs ; un tag `X.Y.Z-rcN` crée une pré-version que personne ne reçoit automatiquement (installable depuis Paramètres > Version de test).
- Retour arrière d'une release : workflow `Promote release` avec `demote`.
- Le serveur de mises à jour (Hazel sur Vercel) met sa liste en cache jusqu'à 15 minutes : une release n'est pas proposée immédiatement.

## Fichiers locaux (non versionnés)

`.claude/` (dont `claude-config/`, `hooks/`, `worktrees/`) et `CLAUDE.local.md` sont ignorés par Git. Si `.claude/claude-config/` est absent (clone neuf, CI), les imports ci-dessus sont sans effet : les règles du claude-config ne sont alors pas chargées, mais ce fichier reste valable.
