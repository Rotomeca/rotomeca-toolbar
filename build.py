import os

# Definir le chemin du repertoire du script en cours
currentPath = os.path.abspath(os.path.dirname(__file__))

foldersPath = []

# Iterer dans chaque dossier et sous-dossier
for root, dirs, files in os.walk(currentPath):
    # Verifier si le fichier 'folder.buildable' existe dans le dossier actuel
    if 'folder.buildable' in files:
        foldersPath.append(root)
        break

for path in foldersPath:
    # Trouver tous les fichiers dont le nom contient 'Base.js'
    for root, dirs, files in os.walk(path):
        for file in files:
            if 'Base.js' in file:
                # Lancer le script buildJavascript.py avec le chemin du fichier comme argument
                file_path = os.path.join(root, file)
                command = 'python buildJavascript.py {}'.format(file_path)
                print('Execution de la commande : {}'.format(command))
                os.system(command)