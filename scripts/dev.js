// Lance Electron en nettoyant les variables d'environnement injectées par
// les terminaux de VSCode (snap/flatpak) qui font planter Electron.
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (env.SNAP) {
  delete env.LD_LIBRARY_PATH;
  delete env.GIO_MODULE_DIR;
  delete env.GTK_PATH;
}

const child = spawn(electron, ['.', '--dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) console.error(`Electron exited with signal ${signal}`);
  process.exit(code ?? 1);
});
