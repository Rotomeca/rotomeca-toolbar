const config = {
  feedUrl: 'https://rotomeca-toolbar-deployement.vercel.app',
  // Second déploiement du même serveur Hazel avec la variable PRE=1 : il ne sert
  // que les pré-versions. Permet d'installer une version de test depuis les
  // Paramètres. `null` : la version de test se télécharge à la main.
  testFeedUrl: null,
  // Dépôt GitHub des versions : utilisé pour prévenir d'une nouvelle version
  // là où Squirrel n'existe pas (Linux : paquets deb et rpm)
  releasesRepo: 'Rotomeca/rotomeca-toolbar',
};

module.exports = config;
