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

Le tag `X.Y.Z` déclenche le workflow `Release`, dont les notes sont produites par git-cliff.

### Publication en deux temps

1. Le tag `X.Y.Z` déclenche le workflow `Release` : il construit les installeurs et crée la release en **pré-version**. Le serveur de mises à jour (Hazel) et l'avis de nouvelle version sous Linux ignorent les pré-versions : personne ne la reçoit automatiquement.
2. Pour tester : dans l'application, **Paramètres > Général > Version de test > Rechercher**, puis **Installer** (Windows, voir ci-dessous) ou **Télécharger** (Linux, ou serveur de test non configuré, qui ouvre la page de la release).
3. Une fois validée : onglet **Actions > Promote release**, tag `X.Y.Z`, action `promote`. La release est alors proposée à tous (le serveur de mises à jour rafraîchit sa liste toutes les 15 minutes, comptez ce délai).
4. Retour arrière : le même workflow avec `demote` repasse la release en pré-version. Ceux qui l'ont déjà installée la gardent ; les autres ne la reçoivent plus.

#### Serveur de test (installation automatique sous Windows)

Le serveur de mises à jour est [Hazel](https://github.com/vercel/hazel) sur Vercel (`configs/appConfig.js`, `feedUrl`). Il n'indexe que les versions publiées. Pour installer une version de test sans passer par la page de la release, il faut un **second déploiement** du même serveur :

1. Sur Vercel, créer un second projet depuis le même dépôt que le serveur de mises à jour.
2. Y définir les mêmes variables d'environnement (`ACCOUNT`, `REPOSITORY`) et ajouter `PRE=1` : ce déploiement ne sert alors que les pré-versions.
3. Renseigner son adresse dans `testFeedUrl` (`configs/appConfig.js`).

Tant que `testFeedUrl` vaut `null`, le bouton de test ouvre la page de la release.

> Les installeurs Windows ne sont signés que si les secrets `WINDOWS_CERTIFICATE_BASE64` et `WINDOWS_CERTIFICATE_PASSWORD` sont définis. Sans eux, Windows affiche un avertissement SmartScreen à l'installation.

