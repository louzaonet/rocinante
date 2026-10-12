// Rocinante: editor de aventuras conversacionales para DAAD.
import LOGO from '../../docs/logo.svg';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { store, useStore, boot, go, undo, redo, setProject, recompile } from './store.js';
import { LocationsPanel, MapPanel } from './locations.jsx';
import { ObjectsPanel } from './objects.jsx';
import { VocabPanel, MessagesPanel, SysPanel, GamePanel } from './texts.jsx';
import { ProcessesPanel } from './processes.jsx';
import { PlayPanel } from './play.jsx';
import { PicturesPanel } from './pictures.jsx';
import { download, pickFile, readBytes, readText, ask, setAsker } from './common.jsx';
import { newProject } from '../project/template.js';
import { importClassic, importDDBFile } from '../import/classic.js';
import { webPage, zx128, zx48, ddbFile, cpc, c64, msx, dos, st, amiga, fileBase } from './exporter.js';
import { t, getLang, setLang } from '../i18n.js';

// La versión, la de package.json (la pone tools/build.mjs), y dónde está el
// código fuente (la AGPL pide que quien use el editor pueda encontrarlo)
const SOURCE = 'https://github.com/louzaonet/rocinante';
const VERSION = typeof __VERSION__ === 'undefined' ? '' : __VERSION__.replace(/\.0$/, '');

// Exportar a Spectrum: la primera letra de la opción dice el formato
const FMT = { z: 'z80', t: 'tap', x: 'tzx', w: 'wav' };

// Exportar: por plataformas, y dentro de cada una sus formatos. Una plataforma
// con un solo formato sale directamente.
const EXPORTS = () => [
  ['web', t('Página web (.html)')],
  { label: 'ZX Spectrum', items: [
    { heading: '128K' },
    ['z128', t('Instantánea (.z80)')], ['t128', t('Cinta (.tap)')], ['x128', t('Cinta (.tzx)')], ['w128', t('Audio de la cinta (.wav)')],
    { heading: '48K' },
    ['z48', t('Instantánea (.z80)')], ['t48', t('Cinta (.tap)')], ['x48', t('Cinta (.tzx)')], ['w48', t('Audio de la cinta (.wav)')],
    { heading: '' },
    ['ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'Amstrad CPC', items: [
    ['cpc-dsk', t('Disco (.dsk)')], ['cpc-cdt', t('Cinta (.cdt)')], ['cpc-wav', t('Audio de la cinta (.wav)')],
    ['cpc-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'Commodore 64', items: [
    ['c64-d64', t('Disco (.d64)')], ['c64-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'MSX', items: [
    ['msx-rom', t('Cartucho (.rom)')], ['msx-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'PC (DOS)', items: [
    ['dos-zip', t('Carpeta para DOSBox (.zip)')], ['dos-img', t('Disquete de 1,44 MB (.img)')], ['dos-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'Atari ST', items: [
    ['st-st', t('Disco (.st)')], ['st-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
  { label: 'Amiga', items: [
    ['amiga-adf', t('Disco (.adf)')], ['amiga-ddb', t('Base de datos DAAD (.ddb)')],
  ] },
];

const PANELS = () => [
  ['juego', t('Juego')], ['mapa', t('Mapa')], ['localidades', t('Localidades')], ['objetos', t('Objetos')],
  ['vocabulario', t('Vocabulario')], ['mensajes', t('Mensajes')], ['sistema', t('Mensajes del sistema')],
  ['procesos', t('Procesos')], ['dibujos', t('Dibujos')], ['probar', t('Probar')],
];

function App() {
  const s = useStore();
  const [menu, setMenu] = useState(null);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  useEffect(() => setAsker((message, ok) => new Promise((res) => setDialog({ message, ok, res }))), []);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !inField(e)) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !inField(e)) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveJSON(); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  if (!s.project) return <div class="loading">{t('Abriendo…')}</div>;
  const p = s.project;
  const errors = s.compiled?.errors || [];
  const warnings = s.compiled?.warnings || [];
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4000); };

  const act = async (what) => {
    setMenu(null);
    try {
      const model = s.compiled?.model;
      const needModel = () => { if (errors.length || !model) throw new Error(t('Arregla antes los errores del juego (lista de abajo).')); return model; };
      switch (what) {
        case 'nuevo-es': case 'nuevo-en': {
          const lang = what.slice(-2);
          if (await ask(t('¿Empezar un juego nuevo? El actual se pierde si no lo has guardado.'), t('Empezar'))) {
            setProject(newProject(lang === 'en' ? 'My adventure' : 'Mi aventura', lang)); recompile(); go('juego');
          }
          break;
        }
        case 'abrir': {
          const f = await pickFile('.json,application/json');
          if (!f) return;
          const pr = JSON.parse(await readText(f));
          if (pr.format !== 'rocinante-proyecto' && pr.format !== 'taller-proyecto') throw new Error(t('Ese fichero no es un proyecto de Rocinante.'));
          pr.format = 'rocinante-proyecto';
          setProject(pr); recompile(); go('juego'); say(t('Proyecto abierto.'));
          break;
        }
        case 'guardar': if (await saveJSON()) say(t('Proyecto guardado.')); break;
        case 'ddb-in': {
          const f = await pickFile('.ddb,.DDB');
          if (!f) return;
          const { project, report } = await importDDBFile(await readBytes(f), f.name);
          setProject(project); recompile(); go('procesos'); say(report);
          break;
        }
        case 'clasico-in': {
          const f = await pickFile('.z80,.Z80,.sna,.SNA,.tap,.TAP,.tzx,.TZX,.dsk,.DSK,.st,.ST,.adf,.ADF,.img,.IMG,.zip,.ZIP,.rom,.ROM,.cdt,.CDT,.d64,.D64,.prg,.PRG');
          if (!f) return;
          const parts = await importClassic(await readBytes(f), f.name);
          // varias partes (en un disco): se elige una
          let part = parts[0];
          if (parts.length > 1) {
            part = null;
            for (const x of parts) {
              if (await ask(t('Hay {n} partes en el fichero. ¿Importar la {p}?', { n: parts.length, p: x.label }), t('Importar'))) { part = x; break; }
            }
            if (!part) return;
          }
          const { project, report } = await part.load();
          setProject(project); recompile(); go('juego');
          say(report);
          break;
        }
        case 'web': if (await download(fileBase(p) + '.html', webPage(p, needModel()), 'text/html')) say(t('Página web descargada. Se abre en cualquier navegador.')); break;
        case 'z128': case 't128': case 'x128': case 'w128': {
          const fmt = FMT[what[0]];
          const r = zx128(p, needModel(), fmt);
          if (await download(`${fileBase(p)}_128k.${fmt}`, r.file)) say(fmt === 'z80' ? t('Instantánea de 128K descargada.') : fmt === 'wav' ? t('Audio de la cinta de 128K descargado.') : t('Cinta de 128K descargada.'));
          break;
        }
        case 'z48': case 't48': case 'x48': case 'w48': {
          const fmt = FMT[what[0]];
          const r = zx48(p, needModel(), fmt);
          if (await download(`${fileBase(p)}_48k.${fmt}`, r.file)) {
            say((fmt === 'z80' ? t('Instantánea de 48K descargada. Quedan {n} bytes libres.', { n: r.info.free }) : fmt === 'wav' ? t('Audio de la cinta de 48K descargado. Quedan {n} bytes libres.', { n: r.info.free }) : t('Cinta de 48K descargada. Quedan {n} bytes libres.', { n: r.info.free }))
              + (r.info.lost ? t(' {n} dibujos no caben en 48K y se quedan fuera.', { n: r.info.lost }) : ''));
          }
          break;
        }
        case 'ddb': if (await download(fileBase(p) + '.ddb', ddbFile(needModel()))) say(t('Base de datos DAAD descargada.')); break;
        case 'c64-d64': case 'c64-ddb': {
          const fmt = what.slice(4);
          const r = c64(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_c64.${fmt}`, r.file))) break;
          say(fmt === 'ddb' ? t('Base de datos DAAD para Commodore 64 descargada.')
            : t('Disco de Commodore 64 descargado. Se arranca con LOAD"*",8 y RUN.') + ' ' + t('Quedan {n} bytes libres.', { n: r.info.free })
              + (r.info.skipped ? t(' {n} dibujos en mapa de bits no salen: el intérprete del C64 solo pinta dibujos vectoriales.', { n: r.info.skipped }) : ''));
          break;
        }
        case 'msx-rom': case 'msx-ddb': {
          const fmt = what.slice(4);
          const r = msx(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_msx.${fmt}`, r.file))) break;
          say(fmt === 'ddb' ? t('Base de datos DAAD para MSX descargada.')
            : t('Cartucho de MSX descargado. Funciona en cualquier emulador de MSX con 64 KB de RAM, también con C-BIOS.') + ' ' + t('Quedan {n} bytes libres.', { n: r.info.free })
              + (r.info.skipped ? t(' {n} dibujos en mapa de bits no salen: el intérprete del MSX solo pinta dibujos vectoriales.', { n: r.info.skipped }) : ''));
          break;
        }
        case 'dos-zip': case 'dos-img': case 'dos-ddb': {
          const fmt = what.slice(4);
          const r = await dos(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_dos.${fmt}`, r.file))) break;
          const bat = needModel().language === 'en' ? 'PLAY.BAT' : 'JUGAR.BAT';
          say({ zip: t('Carpeta de PC descargada. Para jugar, descomprímela y arrastra {bat} sobre DOSBox.', { bat }),
            img: t('Disquete de PC descargado. No es de arranque: arranca MS-DOS o FreeDOS en el emulador, pasa a la unidad A: y escribe {cmd}.', { cmd: bat.slice(0, -4) }),
            ddb: t('Base de datos DAAD para PC descargada.') }[fmt]);
          break;
        }
        case 'st-st': case 'st-ddb': {
          const fmt = what.slice(3);
          const r = await st(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_st.${fmt}`, r.file))) break;
          say(fmt === 'ddb' ? t('Base de datos DAAD para Atari ST descargada.')
            : t('Disco de Atari ST descargado. Arranca solo con EmuTOS y con el TOS 1.04 o posterior; con un TOS anterior, abre {prg} desde el escritorio.', { prg: needModel().language === 'en' ? 'EDI1.PRG' : 'SDI1.PRG' }));
          break;
        }
        case 'amiga-adf': case 'amiga-ddb': {
          const fmt = what.slice(6);
          const r = await amiga(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_amiga.${fmt}`, r.file))) break;
          say(fmt === 'ddb' ? t('Base de datos DAAD para Amiga descargada.') : t('Disco de Amiga descargado. Arranca solo al meterlo en la disquetera.'));
          break;
        }
        case 'cpc-dsk': case 'cpc-cdt': case 'cpc-wav': case 'cpc-ddb': {
          const fmt = what.slice(4);
          const r = cpc(p, needModel(), fmt);
          if (!(await download(`${fileBase(p)}_cpc.${fmt}`, r.file))) break;
          const msg = { dsk: t('Disco de Amstrad CPC descargado. Se arranca con RUN"DISC".'), cdt: t('Cinta de Amstrad CPC descargada. Se carga con RUN"".'),
            wav: t('Audio de la cinta de Amstrad CPC descargado.'), ddb: t('Base de datos DAAD para Amstrad CPC descargada.') }[fmt];
          say(msg + (fmt !== 'ddb' ? ' ' + t('Quedan {n} bytes libres.', { n: r.info.free }) : '')
            + (r.info.skipped ? t(' {n} dibujos en mapa de bits no salen: el intérprete del CPC solo pinta dibujos vectoriales.', { n: r.info.skipped }) : ''));
          break;
        }
      }
    } catch (e) {
      say(e.message);
      console.error(e);
    }
  };
  function saveJSON() { return download(fileBase(store.project) + '.rocinante.json', JSON.stringify(store.project, null, 1), 'application/json'); }

  const panel = s.view.panel;
  return (
    <div class="app">
      <header class="top">
        <div class="brand" title={t('Rocinante {v}, editor de aventuras conversacionales para DAAD', { v: VERSION })}>
          <span class="brand-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO }} />
          <span class="brand-name">Rocinante</span><span class="brand-game">{p.meta.title}</span>
        </div>
        <nav class="menus">
          <Menu label={t('Proyecto')} open={menu === 'p'} onToggle={() => setMenu(menu === 'p' ? null : 'p')} items={[
            ['nuevo-es', t('Juego nuevo en castellano')], ['nuevo-en', t('Juego nuevo en inglés')],
            ['abrir', t('Abrir proyecto (.json)')], ['guardar', t('Guardar proyecto (.json)')],
            ['ddb-in', t('Importar base de datos DAAD (.ddb)')], ['clasico-in', t('Importar juego hecho con DAAD o PAW (Spectrum, CPC, C64, MSX, PC, Atari ST, Amiga)')],
          ]} onPick={act} />
          <Menu label={t('Exportar')} open={menu === 'e'} onToggle={() => setMenu(menu === 'e' ? null : 'e')} items={EXPORTS()} onPick={act} />
          <button class="btn ghost" onClick={undo} disabled={!s.undo.length} title="Ctrl+Z">{t('Deshacer')}</button>
          <button class="btn ghost" onClick={redo} disabled={!s.redo.length} title="Ctrl+Y">{t('Rehacer')}</button>
          <button class="btn ghost lang" onClick={() => { setLang(getLang() === 'es' ? 'en' : 'es'); recompile(); }}
            title={t('Idioma del editor')} aria-label={t('Cambiar el editor a inglés')} lang={getLang() === 'es' ? 'en' : 'es'}>{getLang() === 'es' ? 'English' : 'Español'}</button>
          <button class={'btn primary' + (panel === 'probar' ? ' on' : '')} onClick={() => go('probar')}>{t('Probar')}</button>
        </nav>
      </header>
      <aside class="side">
        <nav>
          {PANELS().map(([k, label]) => (
            <a href={'#' + k} class={panel === k ? 'sel' : ''} onClick={(e) => { e.preventDefault(); go(k); }}>{label}
              {k === 'procesos' && errors.filter((x) => x.kind === 'process').length > 0 && <span class="badge">{errors.filter((x) => x.kind === 'process').length}</span>}
            </a>
          ))}
        </nav>
        <p class="side-foot">{t('Se guarda solo en este navegador. Usa Proyecto, Guardar para tener una copia.')}<br />Rocinante {VERSION} · <a href={SOURCE} target="_blank" rel="noopener">{t('Código fuente')}</a></p>
      </aside>
      <main class="main">
        {panel === 'juego' && <GamePanel />}
        {panel === 'mapa' && <MapPanel />}
        {panel === 'localidades' && <LocationsPanel />}
        {panel === 'objetos' && <ObjectsPanel />}
        {panel === 'vocabulario' && <VocabPanel />}
        {panel === 'mensajes' && <MessagesPanel />}
        {panel === 'sistema' && <SysPanel />}
        {panel === 'procesos' && <ProcessesPanel />}
        {panel === 'dibujos' && <PicturesPanel />}
        {panel === 'probar' && <PlayPanel />}
      </main>
      <footer class={'problems' + (errors.length ? ' bad' : '')}>
        {errors.length === 0 && warnings.length === 0 && <span>{t('Sin errores.')}</span>}
        {errors.length > 0 && <span class="count">{errors.length === 1 ? t('1 error') : t('{n} errores', { n: errors.length })}</span>}
        <ul>
          {[...errors.map((e) => ({ ...e, err: true })), ...warnings].slice(0, 30).map((e) => (
            <li class={e.err ? 'e' : 'w'} onClick={() => jump(e)}>{where(e)}{e.msg}</li>
          ))}
        </ul>
      </footer>
      {toast && <div class="toast" role="status">{toast}</div>}
      {dialog && (
        <div class="dialog-back" onClick={() => { dialog.res(false); setDialog(null); }}>
          <div class="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{dialog.message}</p>
            <div class="row">
              <button class="btn primary" autoFocus onClick={() => { dialog.res(true); setDialog(null); }}>{dialog.ok}</button>
              <button class="btn" onClick={() => { dialog.res(false); setDialog(null); }}>{t('Cancelar')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function where(e) {
  if (e.kind === 'process') return t('Proceso {id}, línea {line}: ', { id: e.id, line: e.line });
  if (e.kind === 'location') return t('Localidad {id}: ', { id: e.id });
  if (e.kind === 'object') return t('Objeto {id}: ', { id: e.id });
  if (e.kind === 'vocab') return t('Vocabulario: ');
  return '';
}
function jump(e) {
  if (e.kind === 'process') go('procesos', { process: e.id, line: e.line });
  else if (e.kind === 'location') go('localidades', { location: e.id });
  else if (e.kind === 'object') go('objetos', { object: e.id });
  else if (e.kind === 'vocab') go('vocabulario');
}
const inField = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);

// items: [clave, texto] o { label, items } (un grupo que se abre debajo, con
// { heading } para separar dentro de él)
function Menu({ label, open, onToggle, items, onPick }) {
  const [sub, setSub] = useState(null);
  const leaf = ([k, text], inner) => (
    <li role="menuitem" tabIndex={0} class={inner ? 'sub' : ''} data-k={k} onClick={() => { setSub(null); onPick(k); }}
      onKeyDown={(e) => e.key === 'Enter' && (setSub(null), onPick(k))}>{text}</li>
  );
  return (
    <div class="menu">
      <button class="btn ghost" aria-expanded={open} onClick={onToggle}>{label}</button>
      {open && (
        <ul class="menu-list" role="menu">
          {items.map((it) => {
            if (Array.isArray(it)) return leaf(it, false);
            const isOpen = sub === it.label;
            const toggle = () => setSub(isOpen ? null : it.label);
            return [
              <li role="menuitem" tabIndex={0} class="group" aria-expanded={isOpen} onClick={toggle}
                onKeyDown={(e) => e.key === 'Enter' && toggle()}><span class="caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>{it.label}</li>,
              isOpen && it.items.map((x) => (Array.isArray(x) ? leaf(x, true)
                : x.heading ? <li class="heading" role="presentation">{x.heading}</li> : <li class="sep" role="separator" />)),
            ];
          })}
        </ul>
      )}
    </div>
  );
}

render(<App />, document.getElementById('app'));
boot();
