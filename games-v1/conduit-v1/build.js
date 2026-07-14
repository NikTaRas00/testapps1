/* =====================================================================
   CONDUIT — build.js
   Bundles the multi-file project into one playable HTML file:
   styles.css is inlined into a <style> tag, every src/*.js module is
   inlined into one <script> tag (in load order). The three.js CDN
   tag stays external. Run:  node build.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const MODULES = [
  'src/config.js',
  'src/audio.js',
  'src/input.js',
  'src/fx.js',
  'src/tunnel.js',
  'src/gates.js',
  'src/player.js',
  'src/game.js',
];

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');
const css  = read('styles.css');
const js   = MODULES.map(m =>
  '/* ========== ' + m + ' ========== */\n' + read(m)
).join('\n\n');

let out = html;

// inline the stylesheet
out = out.replace(
  /<link rel="stylesheet" href="styles\.css">/,
  '<style>\n' + css + '\n</style>');

// replace the module script tags (keep the cdnjs three.js tag)
const first = out.indexOf('<script src="src/');
const lastTag = '<script src="src/game.js"></script>';
const lastEnd = out.indexOf(lastTag) + lastTag.length;
out = out.slice(0, first) +
      '<script>\n' + js + '\n</script>' +
      out.slice(lastEnd);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/conduit.html'), out);

console.log('built dist/conduit.html —',
  out.length, 'bytes,',
  out.split('\n').length, 'lines');
