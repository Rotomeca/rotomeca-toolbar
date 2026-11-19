# Rotomeca Toolbar
![image](https://github.com/user-attachments/assets/1d0a1249-63de-4afb-911a-1d81d4e19996)

Ajoute une toolbar à gauche pour lancer des sites web an arrière plan.  

## Licence

Ce logiciel est distribué sous [licence publique de l'Union européenne (EUPL) v. 1.2](LICENSE), une licence copyleft : les versions modifiées que vous distribuez doivent rester sous la même licence (ou une licence compatible listée en annexe de l'EUPL).

## Contribuer / publier une version

Le changelog est généré par [git-cliff](https://git-cliff.org) (`cliff.toml`) à partir des messages de commit (`feat:`, `fix:`, `ci:`, ...).

```bash
# Fin d'une feature : un seul commit au format Conventional Commits
git flow feature finish --squash <nom>   # message : feat: :sparkles: Description

# Publication
git flow release start X.Y.Z
# bump de "version" dans package.json, puis :
git cliff --tag X.Y.Z -o CHANGELOG.md
git commit -am "build: :bookmark: X.Y.Z"
git flow release finish X.Y.Z
git push --follow-tags origin main develop
```

Le tag `X.Y.Z` déclenche le workflow `Release` : il construit les installeurs, génère les notes avec git-cliff et **publie la release directement**. Le serveur de mises à jour la propose ensuite à tous les utilisateurs (il rafraîchit sa liste toutes les 15 minutes, comptez ce délai).

### Pré-versions (tester avant de publier)

Une pré-version a son propre numéro `X.Y.Z-rcN` (`3.4.0-rc1`, `3.4.0-rc2`…) et sa propre branche `pre-release/X.Y.Z-rcN`, **jamais fusionnée dans `main`** : seules les vraies releases (`release/`) y vont.

```bash
git switch develop                  # propre et à jour
pnpm pre-release 3.4.0 --push       # branche pre-release/3.4.0-rc1, tag 3.4.0-rc1, push
```

- `--rc N` impose le numéro (sinon, le suivant parmi les tags existants) ; `--dry-run` affiche sans rien faire ; sans `--push`, tout reste en local et la commande à lancer est affichée.
- Le tag `X.Y.Z-rcN` déclenche le workflow `Release`, qui crée une **pré-version** GitHub. Le serveur de mises à jour et l'avis de nouvelle version sous Linux l'ignorent : personne ne la reçoit automatiquement.
- Pour la tester : **Paramètres > Général > Version de test > Rechercher**, puis **Installer** (Windows, voir ci-dessous) ou **Télécharger** (Linux, ou serveur de test non configuré : ouvre la page de la release).
- Un correctif ? Refaire `pnpm pre-release 3.4.0 --push` : le numéro passe à `-rc2`.
- Quand elle est validée, publier la vraie release `X.Y.Z` avec le flux git flow ci-dessus. C'est un second build du même code. En ordre de versions, `3.4.0-rc1` est plus ancienne que `3.4.0` : une app qui a installé la pré-version reçoit la release finale automatiquement.

### Retirer une release

Onglet **Actions > Promote release**, tag `X.Y.Z` :

- `demote` repasse la release en pré-version : elle n'est plus proposée à ceux qui n'ont pas encore mis à jour (ceux qui l'ont installée la gardent). C'est le frein de secours d'une release publiée trop vite.
- `promote` publie une release restée en pré-version (la `3.3.0` a été créée ainsi, avant le flux `-rcN`).

#### Serveur de test (installation automatique sous Windows)

Le serveur de mises à jour est [Hazel](https://github.com/vercel/hazel) sur Vercel (`configs/appConfig.js`, `feedUrl`). Il n'indexe que les versions publiées. Pour installer une version de test sans passer par la page de la release, il faut un **second déploiement** du même serveur :

1. Sur Vercel, créer un second projet depuis le même dépôt que le serveur de mises à jour.
2. Y définir les mêmes variables d'environnement (`ACCOUNT`, `REPOSITORY`) et ajouter `PRE=1` : ce déploiement ne sert alors que les pré-versions.
3. Renseigner son adresse dans `testFeedUrl` (`configs/appConfig.js`).

Tant que `testFeedUrl` vaut `null`, le bouton de test ouvre la page de la release.

> Les installeurs Windows ne sont signés que si les secrets `WINDOWS_CERTIFICATE_BASE64` et `WINDOWS_CERTIFICATE_PASSWORD` sont définis. Sans eux, Windows affiche un avertissement SmartScreen à l'installation.

