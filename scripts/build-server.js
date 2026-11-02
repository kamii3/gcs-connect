const path = require('path');

const serverTsPath = path.resolve(__dirname, '../server.ts');
const serverJsPath = path.resolve(__dirname, '../server.js');

const esbuild = require('esbuild');
console.log('[BuildServer] Bundling server.ts into server.js with esbuild...');
esbuild.buildSync({
  entryPoints: [serverTsPath],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: serverJsPath,
});
console.log('[BuildServer] server.js bundled successfully.');
