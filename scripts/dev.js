// Lance Electron en nettoyant les variables d'environnement injectées par
// les terminaux de VSCode (snap) qui font planter Electron.
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const SNAP_POLLUTED = [
  'LD_LIBRARY_PATH',
  'GIO_MODULE_DIR',
  'GIO_EXTRA_MODULES',
  'GTK_PATH',
  'GTK_EXE_PREFIX',
  'GTK_IM_MODULE_FILE',
  'GDK_PIXBUF_MODULE_FILE',
  'GDK_PIXBUF_MODULEDIR',
  'LOCPATH',
  'GSETTINGS_SCHEMA_DIR',
];

for (const key of SNAP_POLLUTED) {
  if (env[key]?.includes('snap')) delete env[key];
}

const child = spawn(electron, [
  '.',
  '--dev',
  ...process.argv.slice(2).filter((arg) => arg !== '--'),
], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) console.error(`Electron exited with signal ${signal}`);
  process.exit(code ?? 1);
});
