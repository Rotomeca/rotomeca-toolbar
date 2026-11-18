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

