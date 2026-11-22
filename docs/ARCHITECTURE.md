# Architecture : qui fait quoi

Ce document est la carte du projet. Il répond à : « où se trouve telle chose, et qui l'appelle ? ».
Chaque fichier `.ts` commence aussi par un commentaire de rôle, et chaque `import` est précédé d'une
ligne `// [fichier] ce qu'il fait` pour savoir sur quoi on s'appuie.

## 1. Vue d'ensemble

Rotomeca Toolbar est une application **Electron** (Windows et Linux). Une barre d'outils est collée au
bord gauche de l'écran ; chaque bouton ouvre un site web, qui tourne en arrière-plan comme une application.

Une application Electron a deux mondes qui ne partagent aucune mémoire :

| Monde | Rôle | Où |
|---|---|---|
| **Processus principal** (Node.js) | Crée les fenêtres, parle au système (zone de notification, mises à jour, fichiers, barre ancrée Windows et X11). C'est lui qui décide. | `main.ts`, `src/main/`, `src/scripts/` (parties « principal ») |
| **Pages** (Chromium) | Affichent l'interface (barre, paramètres, fenêtre d'ajout...). Elles ne peuvent rien faire seules : elles demandent au processus principal. | `src/page.*/`, `index.html`, `src/scripts/` (parties « page »), `src/index/` |
| **Preload** | Petit pont sécurisé entre les deux : expose `window.api` aux pages (`invoke`, `on`, `t`). | `preload.ts`, `src/scripts/media/media-preload.ts` |

Les deux mondes échangent par des **canaux IPC** nommés, définis une seule fois dans `src/shared/ipc/events.ts`
et typés dans `src/shared/ipc/contracts.ts`.

```
 Page (Chromium)            Preload               Processus principal (Node.js)
 ───────────────          ───────────          ─────────────────────────────────
 window.api.invoke(  ───►  liste blanche  ───►  IpcRouter ──► App.ts ──► service
   'getVersion')            des canaux          (contrôle de l'origine)
 window.api.on(      ◄───  liste blanche  ◄───  postMessage(canal, données)
   'appAdded', ...)
```

## 2. Le démarrage, pas à pas

1. **`main.ts`** (point d'entrée) : gère les évènements d'installation Squirrel, le mode `--smoke`, sinon appelle `bootstrap()`.
2. **`src/main/bootstrap.ts`** : fige le dossier de données, prend le verrou « une seule instance », restaure/sauvegarde
   les données, crée le magasin de permissions et le gestionnaire de mises à jour, puis crée **`App`** et enregistre le raccourci global.
3. **`src/main/App.ts`** (la racine de composition) : crée tous les services ci-dessous, démarre le thème, les mises à jour,
   le menu contextuel, l'icône de zone de notification, branche les canaux IPC, puis démarre la barre (`ToolbarController.start()`).
4. À partir de là, tout est piloté par les **évènements** : un clic dans une page → un appel IPC → `App` route vers le bon service.

## 3. Les services du processus principal (`src/main/`)

`App.ts` ne contient presque aucune règle : il **assemble** et **route**. Les règles sont dans les dossiers ci-dessous,
une logique « pure » (testable sans Electron) d'un côté, un adaptateur Electron mince de l'autre.

### Fenêtres : `windows/`
| Fichier | Rôle |
|---|---|
| `AppWindows.ts` | Crée chaque fenêtre à la première demande (bouton, barre, popups, ajout, bord, paramètres, fenêtre des sites) et les oublie quand elles se ferment. |
| `windowSpecs.ts` | Décrit chaque fenêtre (taille, transparence, page à charger) et regroupe les dimensions fixes de l'interface. |
| `windowConfig.ts` | Transforme une description en options Electron. **Impose** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` : aucun appel ne peut les affaiblir. |
| `WindowRegistry.ts` | Annuaire nom → fenêtre (oublie les fenêtres détruites). |
| `displays.ts` | Choix de l'écran (celui des paramètres, sinon le principal) et liste des écrans pour les paramètres. |
| `placement.ts` | Centrage vertical d'une petite fenêtre sur un bouton sans sortir de la zone de travail. |
| `popupWindow.ts` | Envoi d'un message à une petite fenêtre une fois sa page chargée. |

### La barre et son affichage : `toolbar/`, `dock/`
| Fichier | Rôle |
|---|---|
| `toolbar/ToolbarController.ts` | Le chef d'orchestre de la barre : ouverte/repliée, mode bouton / souris / ancrée, masquage automatique, rail, placement des fenêtres, « toujours au-dessus ». |
| `toolbar/displayMode.ts` | Déduit le mode d'affichage (bouton, ancrée, souris, masquage auto) des réglages. La barre ancrée prime. |
| `dock/dockGeometry.ts` | Calculs purs : disposition des fenêtres, bande à réserver, pas du masquage automatique. |
| `dock/AppBar.ts` | Barre ancrée Windows (AppBar) : réserve l'espace pour que les fenêtres maximisées ne passent pas dessous. |
| `dock/appBarApi.ts` | Charge koffi côté Windows (appels natifs `SHAppBarMessage`...). |
| `dock/X11StrutBar.ts` | Barre ancrée Linux X11 : réserve l'espace par les struts EWMH (`_NET_WM_STRUT_PARTIAL`). Même interface `DockBar` que `AppBar`. |
| `dock/x11Api.ts` | **Seul endroit qui charge `libX11` via koffi** (`XChangeProperty`...). Indisponible sous Wayland. |
| `dock/createAppBar.ts` | Choisit `AppBar` (Windows) ou `X11StrutBar` (Linux X11) et les branche sur les conversions d'écran d'Electron. |

### Applications de la barre : `apps/`
| Fichier | Rôle |
|---|---|
| `appList.ts` | Règles pures sur la liste : déplacer, séparateurs, supprimer, remplacer. |
| `AppListService.ts` | La liste vivante : valide ce que les pages envoient, enregistre sur disque, prévient la barre de chaque changement. |
| `storedApps.ts` | Relit `data.rsft` sans jamais le rejeter en bloc : entrée inutilisable écartée, champ invalide corrigé, entrée valide conservée telle quelle (une copie `.invalid` est gardée avant toute réparation). |
| `electronFaviconFetch.ts` | Requête réseau des icônes (`net.request`) : chaque redirection est contrôlée (jamais vers le réseau local depuis un site public). |
| `favicon.ts` | Cherche l'icône d'un site : lit sa page, classe les `<link rel="icon">` (la plus grande d'abord), repli sur `/favicon.ico`, contrôle le contenu et renvoie un `data:`. |
| `FaviconService.ts` | Garde les icônes (mémoire + `favicons.v2.json`, 14 jours, absence d'icône 6 h, site injoignable non mémorisé) ; une seule recherche par site. |
| `AppViewHost.ts` | Les sites ouverts en arrière-plan : une vue par site, non-lus, son, morceau en cours, son coupé. |

### Médias, infobulle, zone de notification : `media/`, `tooltip/`, `tray/`
| Fichier | Rôle |
|---|---|
| `media/MediaPopup.ts` | Petit lecteur affiché au survol d'un bouton qui joue un morceau. |
| `media/mediaState.ts` | Calculs sur l'état média : avancée, texte « en cours de lecture » de la zone de notification. |
| `tooltip/TooltipPopup.ts` | Infobulle à droite de la barre, centrée sur le bouton survolé. |
| `tray/TrayService.ts` | Icône de la zone de notification : menu, infobulle, point de mise à jour. |
| `tray/electronTray.ts` | Branche `TrayService` sur Electron (icônes mises en cache). |
| `tray/trayTooltip.ts`, `tray/updateBadge.ts` | Texte de l'infobulle ; dessin du point orange/vert sur l'icône. |

### Réglages, thème, données : `settings/`, `theming/`, `persistence/`
| Fichier | Rôle |
|---|---|
| `settings/Settings.ts` | Les réglages de l'utilisateur : lecture avec valeurs par défaut, écriture validée. |
| `settings/themes.ts` | Liste blanche des thèmes, palettes, densités d'effets. |
| `settings/applySettingsUpdate.ts` | Applique ce que la page des paramètres envoie et dit ce qui a changé. |
| `settings/defaultSettings.ts` | Fabrique l'unique instance de `Settings` (fichier `settings.rcft`). |
| `theming/ThemeService.ts` | Applique le thème à toutes les pages locales et le met à jour (mode du système, changement de saison). |
| `theming/themeScript.ts` | Construit le script qui pose `data-theme` / `data-palette` sur une page. |
| `persistence/JsonFileStore.ts` | Fichier JSON écrit de façon atomique et forcée sur disque (droits réservés à l'utilisateur), avec copie `.bak` ; un fichier corrompu est mis de côté et la sauvegarde `.bak` est relue. |

### Sécurité et permissions : `security/`, `permissions/`, `ipc/`
| Fichier | Rôle |
|---|---|
| `ipc/IpcRouter.ts` | Porte d'entrée unique des appels des pages : refuse tout ce qui ne vient pas de la page principale d'une fenêtre locale. |
| `ipc/trustedSender.ts` | La règle « d'où peut venir un appel IPC » : la page principale d'une page de l'application. |
| `ipc/channelAccess.ts` | Pour chaque canal des pages, les seules fenêtres autorisées à l'appeler (la page du lecteur média ne peut pas installer une mise à jour). Un canal ajouté dans `events.ts` doit y figurer, un test le vérifie. |
| `security/localPageGuard.ts` | Ce qu'est une page locale (un fichier de `dist/`, pas un `file:` quelconque) et le verrou posé sur chacune : ni popup, ni navigation hors de l'application. |
| `security/launchArguments.ts` | Refuse, dans l'application empaquetée, les options de débogage distant (`--remote-debugging-*`, `--inspect*`). |
| `security/sanitizeAppData.ts` | Valide une application reçue d'une page (adresse http(s), nom, image). |
| `security/webContentsHardener.ts` | Durcit les pages des sites tiers : popups, navigation, `<webview>` interdits. |
| `permissions/` | Demande de permission (caméra, micro, position) : dialogue, mémorisation, révocation. |

### Mises à jour : `updates/`
| Fichier | Rôle |
|---|---|
| `updates/createUpdateManager.ts` | Branche le gestionnaire de mises à jour (`src/scripts/UpdateManager.ts`) sur Squirrel, GitHub et les sauvegardes. |
| `updates/updateMode.ts` | Choisit le mode (Squirrel, AppImage, GitHub sous Linux deb/rpm, simulation) et le serveur (stable ou test). |
| `updates/appImageUpdater.ts` | Présente electron-updater (AppImage Linux) comme l'interface de Squirrel, avec la progression réelle du téléchargement et le canal « test » (pré-versions). |
| `updates/updateNotification.ts` | Notification système « mise à jour prête ». |

### Menu contextuel : `contextmenu/`
`contextMenuModel.ts` (contenu du menu, pur) → `ContextMenuController.ts` (quand l'afficher) → `electronContextMenu.ts` (fenêtre du menu et injection du script de clic droit).

## 4. Les modules partagés et « anciens » (`src/shared/`, `src/scripts/`)

| Fichier | Rôle |
|---|---|
| `src/shared/ipc/events.ts` | **Source unique** des noms de canaux IPC. Un canal s'ajoute ici, une seule fois. |
| `src/shared/ipc/contracts.ts` | Arguments et réponse de chaque canal (vérifié à la compilation contre `events.ts`). |
| `src/shared/dto.ts` | Formes des données échangées entre le processus principal et les pages. |
| `src/shared/updateLevel.ts`, `src/shared/i18n/interpolate.ts` | Petites règles utilisées des deux côtés. |
| `src/shared/requestThrottle.ts`, `src/shared/mediaLimits.ts` | Limiteur de débit et bornes de l'état média : un émetteur non fiable (iframe de recherche, site) ne peut pas inonder son destinataire. |
| `src/scripts/UpdateManager.ts`, `githubReleases.ts`, `versions.ts` | Logique des mises à jour (injectée : testable sans Electron). |
| `src/scripts/Persistence.ts` | Dossier de données, sauvegardes, cookies et connexions des sites. |
| `src/scripts/PermissionStore.ts`, `permissionPolicy.ts` | Mémoire et règles des permissions des sites. |
| `src/scripts/AppIndicators.ts` | Lecture sûre du titre (non-lus) et de l'état média envoyés par un site. |
| `src/scripts/Seasons.ts`, `i18n.ts`, `appIcon.ts`, `safeUrl.ts` | Saisons, traductions, icône, vérification d'adresse. |
| `src/scripts/media/media-preload.ts` | Preload des **sites** : relève ce qu'ils jouent (MediaSession) et obéit aux commandes. |

## 5. Les pages (`src/page.*/`)

| Page | Rôle | Messages principaux |
|---|---|---|
| `index.html` + `src/index/renderer.ts` | Le bouton qui ouvre/ferme la barre (mode bouton). | `toggleToolbar` |
| `page.taskbar/` | **La barre** : boutons des applications, séparateurs, rail, indicateurs. | `appAdded`, `appIndicators`, `init`... |
| `page.apps/` | Bandeau au-dessus d'un site (fermer, arrêter, ouvrir dans le navigateur, recharger). | `frameOpen` |
| `page.add/` | Fenêtre d'ajout (sites populaires, recherche) et d'édition. | `requestAddData` |
| `page.settings/` | Paramètres : thèmes, mode d'affichage, mises à jour, permissions. | `setting.updated` |
| `page.media/` | Mini-lecteur de morceau. | `mediaState`, `mediaControl` |
| `page.tooltip/`, `page.edge/`, `page.contextmenu/` | Infobulle, zone sensible du bord gauche, menu du clic droit. | |
| `src/scripts/components/HTMLToolbarButton.ts` | Le bouton d'une application (icône, pastille de non-lus, son, pochette). | |

Les calculs des pages sont séparés du DOM quand c'est possible (`appForm.ts`, `mediaView.ts`, `themeCatalog.ts`,
`updateCard.ts`) pour être testés.

## 6. Quatre parcours pour comprendre

**Ajouter une application** : la page d'ajout appelle `requestAddData` → `IpcRouter` vérifie l'origine → `App` appelle
`AppListService.add` → `sanitizeAppData` valide → la liste s'enregistre (`JsonFileStore`, fichier `data.rsft`) → la barre reçoit
`appAdded` et crée un `HTMLToolbarButton`.

**Ouvrir un site** : clic sur un bouton → `openFrame` → `AppViewHost.open` crée une vue durcie (`webContentsHardener`) dans la
fenêtre des sites → le site tourne en arrière-plan ; son titre `(3) Boîte` donne la pastille de non-lus, son audio/média remonte via
`media-preload` → `AppViewHost.update` → `App.sendIndicators` → la barre, le popup et la zone de notification se mettent à jour.

**Changer de mode d'affichage** : la page des paramètres envoie `setting.updated` → `applySettingsUpdate` valide et enregistre
→ `ToolbarController.rebuildForModeChange` détruit/recrée la barre dans le bon mode (bouton, souris, ancrée).

**Mise à jour** : `UpdateManager` vérifie (Squirrel sous Windows, electron-updater pour une AppImage Linux, GitHub pour un deb/rpm) → l'état est envoyé aux paramètres et à la
barre (`updateState`) → `TrayService` colore l'icône → une notification propose d'installer.

## 7. Données de l'utilisateur (ne jamais changer ces noms)

Dans `~/.rotomeca-toolbar-data/` (ou `%APPDATA%` sous Windows) : `data.rsft` (applications), `settings.rcft` (réglages),
`permissions.rcft` (décisions de permissions). Le dossier `userData` d'Electron est figé sur `rotomecatoolbar` pour ne pas
perdre cookies et connexions.

## 8. Sécurité en une page

- Toutes les fenêtres : `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` (imposé par `windowConfig.ts`).
- Un appel IPC n'est accepté que de la page principale d'une page de l'application, c'est-à-dire un fichier de `dist/` (`ipc/trustedSender.ts`, `security/localPageGuard.ts`), et seulement pour les canaux de sa fenêtre (`ipc/channelAccess.ts`). Les fenêtres locales ne peuvent ni ouvrir de popup ni naviguer hors de l'application.
- Les pages ne reçoivent que `window.api`, limité aux canaux de `events.ts` (le preload dérive sa liste blanche de ce fichier).
- Tout ce qui vient d'une page ou d'un site est non fiable : validé (`sanitizeAppData`, `isSafeUrl`, `sanitizeMediaState`), jamais inséré en `innerHTML`.

## 9. Où ajouter quoi ?

| Je veux... | Je touche à... |
|---|---|
| un nouveau canal page → principal | `events.ts` (nom), `contracts.ts` (types), le service concerné, une route dans `App.registerIpcRoutes` |
| un nouveau message principal → pages | `events.ts` (`pageEventList`), `contracts.ts` (`PushContracts`) |
| une nouvelle règle métier | un module dans `src/main/<domaine>/` **avec ses tests** (jamais dans `App.ts`) |
| une nouvelle fenêtre | `windowSpecs.ts` + un accesseur dans `AppWindows.ts` |
| un nouveau réglage | `Settings.ts`, `SettingsFormDto` (`contracts.ts`), `applySettingsUpdate.ts`, la page des paramètres, `fr.json` et `en.json` |
| un texte visible | `src/locales/fr.json` **et** `en.json` (mêmes clés) |

## 10. Build, tests, vérifications

- `pnpm build` : construit `dist/` (copie des ressources, preloads regroupés par esbuild, compilation `tsc`). C'est `dist/` qui s'exécute et s'empaquette.
- `pnpm typecheck` / `pnpm lint` / `pnpm test` : à passer avant tout commit. Les tests (`tests/*.test.js`) lisent `dist/`.
- `pnpm smoke` : démarre l'application en mode « fumée » (pages, preloads, koffi, et sous Windows l'application complète sur des données temporaires).
- `pnpm package` puis `pnpm verify:package` et `pnpm smoke:packaged` : contrôlent le paquet final.
- Détails des commandes, du git flow et des pré-versions : `CLAUDE.md` et `README.md`.
