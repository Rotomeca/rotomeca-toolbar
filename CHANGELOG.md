# Changelog
## 4.1.0 - 2026-11-22

### Autres
- **git** : Ignore local Claude Code files
- **smoke** : Add a smoke mode that checks pages, preloads and koffi
- **smoke** : Load every main-process module in the smoke mode
- **ipc** : Test the built preload, the channel lists and interpolate
- **main** : Cover ToolbarController, ThemeService and IpcRouter
- **tests** : Fix quote style in ipcAndTheme test
- **smoke** : Start the full app on a 3.4.1 data file and check what it shows and rewrites

### Build
- **dist** : Embed a dist/ copy of the app instead of the sources
- **preload** : Bundle the two preloads into single files with esbuild
- **typescript** : Add strict tsconfigs, tsc in the build and typescript-eslint
- **ts** : Enable exactOptionalPropertyTypes and document the finished migration
- **release** : Let pre-release start from any branch with --from
- Add esbuild and koffi to onlyBuiltDependencies in pnpm configuration

### CI
- **smoke** : Verify the packaged app and run the smoke test in CI

### Corrections
- **main** : Register IPC routes before the first window is created
- **main** : Translate hard-coded texts and harden popups and toggles
- **package** : Update version to 4.0.0
- **dock** : Convert dock rectangles by display scale factor on X11
- **dock** : Keep the X11 dock inside the work area
- **dock** : Let the X11 dock reach the bottom edge of the screen
- **favicon** : Update caching logic for favicons and enhance error handling
- **MediaPopup** : Enhance hover behavior to prevent premature hiding when hovering over the popup

### Documentation
- **claude** : Add CLAUDE.md importing the claude-config
- **claude** : Document the TypeScript migration, dist/ and the new commands
- Document every class and function in French, annotate imports, add the architecture map
- **dock** : Document the X11 dock and check libX11 in the smoke run

### Nouveautés
- **ipc** : Type every channel with shared DTOs and invoke/push contracts
- **dock** : Dock the toolbar on Linux X11 through EWMH struts
- **updates** : Update Linux AppImages automatically with electron-updater and show the real download progress
- **updates** : Enhance AppImageUpdater to support versioned pre-releases and update feed URLs
- **theme** : Add variants for clair and sombre themes in themeCatalog
- **apps** : Add a right-click menu to reset the size of the apps window
- **favicon** : Implement FaviconService to manage site icons and caching
- **marquee** : Implement text scrolling for long titles and artists in media player

### Refactorisation
- **ts** : Convert versions, appIcon, PermissionStore, permissionPolicy and appConfig to TypeScript
- **updates** : Convert UpdateManager to TypeScript and extract githubReleases
- **ts** : Convert Persistence, Seasons, AppIndicators and i18n to TypeScript
- **ipc** : Single source of IPC channel names, preloads in TypeScript
- **main** : Extract security, permissions and update helpers from main.js
- **main** : Extract tray badge/tooltip, media state and window placement from main.js
- **apps** : Extract app list operations and now-playing tooltip from main.js
- **settings** : Convert settings and FileData to TypeScript with injected store
- **windows** : Split BaseAppObject into registry, window config, displays and IPC origin check
- **dock** : Convert AppBar to TypeScript and extract dock geometry
- **contextmenu** : Move context menu to TypeScript with a pure menu model
- **media** : Extract media and tooltip popups from main.js
- **apps** : Extract AppViewHost (site views, indicators, mute, media control) from main.js
- **tray** : Extract TrayService and its Electron adapter from main.js
- **settings** : Extract applySettingsUpdate from main.js
- **windows** : Describe each window in windowSpecs and share size constants
- **apps** : Extract AppListService (add, edit, move, delete, persist) from main.js
- **main** : Replace AppMain/main.js with a TypeScript composition root
- **pages** : Convert tooltip, edge, apps, media, context menu and button pages to TypeScript
- **pages** : Convert the taskbar, add, settings pages and components to TypeScript
## 3.4.1 - 2026-11-19

### Corrections
- **release** : Update release notes generation for pre-releases and adjust tag pattern
## 3.4.0 - 2026-11-19

### Build
- 3.4.0

### Nouveautés
- **updates** : Understand X.Y.Z-rcN pre-release versions
- **release** : Pre-releases get X.Y.Z-rcN versions and pre-release/ branches
- **settings** : Show when the installed version is a pre-release
- **icon** : Dedicated icon with an RC badge for pre-release builds
## 3.3.0 - 2026-11-19

### Autres
- **package** : Update version to 3.2.0
- **core** : Add node:test suite and run it in release CI
- **settings** : Reduce settings window height now that content is tabbed
- **settings** : Settings window 800x730
- **settings** : Raise settings window height to 840 for the test version block
- **settings** : Settings window height 810 and neutral test-version help text

### Build
- 3.3.0

### CI
- **lint** : Add lint script and gate release on lint

### Corrections
- **security** : Make sandbox and context isolation explicit

### Nouveautés
- **permissions** : Persist site permission decisions and allow revoking them
- **settings** : Split settings page into tabs to avoid scrolling
- **updates** : Publish releases as pre-release and add a test version channel
- **updates** : Install the test version automatically through a pre-release update server
- **updates** : Configure the pre-release update server
## 3.2.0 - 2026-11-19

### Autres
- **package** : Update version to 3.2.0

### Nouveautés
- **updates** : Add updates card, hourly check and update indicators
## 3.1.1 - 2026-11-19

### Autres
- **package** : Update version to 3.1.1

### Nouveautés
- **persistence** : Add cookie logging and enhance session management
## 3.1.0 - 2026-11-18

### Autres
- Update build strategy to disable fail-fast and adjust OS matrix
- Improve release artifact handling by listing only files for upload
- **toolbar** : Center the hide button and dividers
- **gitignore** : Add settings.rcft and plan-refonte to ignore list
- **toolbar** : Dark veil under the bottom buttons when season effects are on
- **package** : Update version to 3.1.0

### Corrections
- **theme** : Restore the base body font after removing ds-bridge
- **toolbar** : Visible hover on plain buttons in Light/Dark, neutral group separators

### Nouveautés
- Implement AppBar support and related settings in the toolbar
- **settings** : Add auto-hide option for the docked bar
- **appbar** : Add auto-hide and a collapsible rail to the docked bar
- **persistence** : Isolate user data path for development environment
- **theme** : Add palettes and typography compat tokens
- **theme** : Ten themes driven by data-theme and data-palette
- **toolbar** : Restyle the docked bar and shortcut tiles with the design system
- **media** : Now-playing card on design system tokens
- **settings** : Rebuild the settings window with design system cards
- **icon** : New application icon
- **toolbar** : Hover and focus tooltip in a dedicated floating window
- **toolbar** : 24 px collapsed rail, media card on click, rouge pressed contrast
- **add** : Rebuild the add window on the design system
- **theme** : Season palettes, effect settings and decor assets
- **settings** : Theme thumbnails by family and season effect options
- **theme** : Seasonal effects on the toolbar and in settings
- **theme** : Compute the official season dates and the season theme of the day
- **theme** : Automatic season theme setting
- **settings** : Parent themes with variants and the automatic season theme

### Refactorisation
- **theme** : Drop hard-coded colors and legacy variables from remaining pages
## 3.0.0 - 2026-11-18

### Autres
- Maj de l'icône
- Update build strategy to disable fail-fast and adjust OS matrix
- Improve release artifact handling by listing only files for upload

### Corrections
- Durcissement de la sécurité (IPC, thème, sites tiers)

### Documentation
- Passage sous licence EUPL-1.2

### Nouveautés
- Ajout du numéro de version
- Add git-cliff configuration for changelog generation and update release workflow
- Ajout de linux
- Add multi-display support and settings management
- Add unread badge and audio indicator on toolbar buttons
- Add per-app mute and media player popup
- Ajout de l'indicateur de position
- Ajout d'une couleur et d'une animation
- Add taskbar ignored state and update tooltip for media playback
- I18n, multi-écran, bord gauche, raccourci, signature et mise à jour Linux

### Refactorisation
- Migration de l'interface vers @rotomeca/design-system
## 2.1.0 - 2026-11-16

### Autres
- Dev:false
- Update version

(cherry picked from commit 6dbcc436ea7049a26f48661002b5edc4654aa50c)

### Build
- Migration de npm vers pnpm

### CI
- Release automatique via GitHub Actions (Squirrel)

### Corrections
- Diverses corrections
- Update Content Security Policy and improve window positioning
- Couleur d'accent vide sous Linux et injection CSS avant chargement
- Electron ^42 (43+ plante en SIGTRAP sur Ubuntu 22.04 / NVIDIA 580)
- Update Content Security Policy and refactor search functionality
- Implement data backup and restore functionality before updates
- Ajout de lodash en dépendance explicite (requis par electron-winstaller en CI)

### Nouveautés
- **events** : Ajout de `settingsStart` à `PageEventList`
- Add pnpm workspace configuration with hoisted node linker
- Add pnpm workspace configuration with hoisted node linker

### Refactorisation
- **settings** : L'évènement `settingsStart` n'utilisait pas `pageEventList`
## 2.0.0 - 2025-01-19

### Autres
- **app** : On ne passe plus par un fichier de configuration pour être en mode `dev`
- Update README.md

Ajout d'un image et d'un texte descriptif

### Corrections
- **settings** : Les paramètres sont sauvegarder dans un dossier externe à l'application
- **save** : `fs` était utilisé au lieu de `FileData.fs`
- **settings** : Le menu était visible

### Documentation
- **save** : Documentation de `FileData`

### Nouveautés
- **data** : Création de la classe `FileData` pour gérer les données de sauvegarde
- **save** : Les données sont sauvegardées dans AppData/Roaming sur windows si les dossiers existent
- **app** : Les données de l'application ne sont plus sauvegardées dans le dossier de l'application
## 1.2.0 - 2025-01-18

### Autres
- Initial commit
- Update version

(cherry picked from commit 6dbcc436ea7049a26f48661002b5edc4654aa50c)
- Disabling dev mode
- Updating version

### Build
- **app** : V1

### Corrections
- **app** : Des notifications de débugages étaient présentes
- **app** : L'auto-update affichait une erreur lors de l'installation
- **settings** : Les thèmes n'avaient pas les bons chemins et plantait l'application
- **toolbar** : Le mode d'affichage de la toolbar n'était pas prit en compte si la toolbar n'avait pas d'applications
- **settings** : Si le mode d'application était la souris, le bouton dans les paramètre n'était pas sélectionné

### Refactorisation
- **app** : Le postmessage vers les fenêtres n'utilisaient pas `pageEventList`

