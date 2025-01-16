import sys
import re

path = sys.argv[1]

file = open(path, "r")

raw = file.read()

# Generer la version ESM
esm = raw.replace('const', 'export const')

# Generer la version CommonJs
match = re.search(r'\bconst\b\s+(\w+)', raw)
common = ''

if match:
    variable_name = match.group(1)
    variable_name.replace('const', '')
    common = raw + ' module.exports = { ' + variable_name + ' };'

# Generer les fichiers
file.close()

esmPath = path.replace('Base', 'Module')
commonPath = path.replace('Base', '')

file = open(esmPath, 'w')
file.write(esm)
file.close()

file = open(commonPath, 'w')
file.write(common)
file.close()
