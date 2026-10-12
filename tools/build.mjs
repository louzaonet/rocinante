// Construye dist/rocinante.html (el editor, un solo fichero) con esbuild.
import * as esbuild from 'esbuild';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');

const player = await esbuild.build({
  entryPoints: [root + 'src/player/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
});
const playerJs = player.outputFiles[0].text;
const ui = await esbuild.build({
  entryPoints: [root + 'src/ui/main.jsx'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020',
  jsx: 'automatic', jsxImportSource: 'preact',
  loader: { '.svg': 'text' },
  define: {
    __VERSION__: JSON.stringify(JSON.parse(read('package.json')).version),
    __PLAYER_JS__: JSON.stringify(playerJs),
    __PAGE_HTML__: JSON.stringify(read('src/player/page.html')),
    __SCREEN_CSS__: JSON.stringify(read('src/player/screen.css')),
  },
});
// el logo, también como icono de la pestaña
const favicon = 'data:image/svg+xml;base64,' + Buffer.from(read('docs/logo.svg')).toString('base64');
// Licencias en la propia página: la de Rocinante y el aviso de Preact, que va
// dentro (la MIT de Preact pide que su aviso acompañe a cada copia)
const version = JSON.parse(read('package.json')).version;
const notice = `<!--
Rocinante ${version}, editor de aventuras conversacionales para DAAD.
Copyright (C) 2026 Jorge Louzao Penalva.
Software libre: GNU AGPL versión 3 o posterior (AGPL-3.0-or-later). Lo que va
dentro de los juegos exportados es MIT-0: cada autor distribuye su juego como
quiera. Ver el fichero LICENSE del código fuente: https://github.com/louzaonet/rocinante

Incluye Preact:
${read('node_modules/preact/LICENSE').replace(/--/g, '- -').trim()}
-->
`;
const html = `<!doctype html>
<html lang="es">
<head>
${notice}<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rocinante, editor de aventuras conversacionales para DAAD</title>
<link rel="icon" type="image/svg+xml" href="${favicon}">
<style>${read('src/ui/style.css')}\n${read('src/player/screen.css')}</style>
</head>
<body>
<div id="app"></div>
<script>${ui.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
fs.mkdirSync(root + 'dist', { recursive: true });
fs.writeFileSync(root + 'dist/rocinante.html', html);
console.log('dist/rocinante.html', (html.length / 1024).toFixed(0), 'KB; reproductor', (playerJs.length / 1024).toFixed(0), 'KB');
