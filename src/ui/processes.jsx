// Procesos: editor de código con colores, números de línea y errores.
import { useRef, useState, useEffect } from 'preact/hooks';
import { store, update, go, allIds, renameId, freeId } from './store.js';
import { LazyInput, validId, ask } from './common.jsx';
import { CONDACTS, BY_NAME } from '../daad/condacts.js';
import { DOC, DOC_EN } from './condact-doc.js';
import { SYSTEM_FLAGS, SPECIAL_LOCS, CONSTANTS } from '../project/symbols.js';
import { PROC_ROLES } from '../project/template.js';
import { t, getLang } from '../i18n.js';

// Para qué sirve cada proceso de la plantilla (por su nombre, en los dos idiomas)
const ROLE_TEXT = ['Se ejecuta al empezar y tras cada RESTART: describe la localidad.', 'Lee la orden del jugador y busca qué hacer.',
  'Cuando la frase no se entiende.', 'Después de describir una localidad.', 'Antes de cada orden: sucesos que pasan solos.',
  'Las respuestas a las órdenes. Aquí va casi todo el juego.', 'Preparación de la partida.'];
const roleOf = (id) => {
  for (const names of Object.values(PROC_ROLES)) { const i = names.indexOf(id); if (i >= 0) return t(ROLE_TEXT[i]); }
  return null;
};
const RESPONSES = (p) => PROC_ROLES[p.meta.language === 'en' ? 'en' : 'es'][5];

export function ProcessesPanel() {
  const p = store.project;
  const sel = store.view.sel.process ?? RESPONSES(p);
  let i = p.processes.findIndex((x) => x.id === sel);
  if (i < 0) i = 0;
  const pr = p.processes[i];
  const errs = (store.compiled?.errors || []).filter((e) => e.kind === 'process');
  const count = (id) => errs.filter((e) => e.id === id).length;
  const taken = allIds(p);
  const [help, setHelp] = useState(true);
  const edRef = useRef();
  return (
    <div class="procs">
      <div class="proc-tabs" role="tablist">
        {p.processes.map((x, n) => (
          <button role="tab" aria-selected={n === i} class={'proc-tab' + (n === i ? ' sel' : '')} onClick={() => go('procesos', { process: x.id })}>
            <span class="num">{n}</span> {x.id}{count(x.id) > 0 && <span class="badge">{count(x.id)}</span>}
          </button>
        ))}
        <button class="btn small" onClick={() => {
          let id;
          update((q) => {
            const en = q.meta.language === 'en';
            id = freeId(en ? 'process' : 'proceso', allIds(q));
            q.processes.push({ id, source: (en ? '; New process. Call it with PROCESS ' : '; Proceso nuevo. Llámalo con PROCESS ') + id + '\n' });
          });
          go('procesos', { process: id });
        }}>{t('Nuevo proceso')}</button>
      </div>
      <div class="proc-head">
        <LazyInput class="id-input" value={pr.id} validate={(v) => validId(v, taken, pr.id)}
          onCommit={(v) => { update((q) => renameId(q, pr.id, v)); go('procesos', { process: v }); }} />
        <span class="note">{roleOf(pr.id) || t('Proceso {n}.', { n: i })}</span>
        <span class="spacer" />
        <button class="btn ghost small" onClick={() => setHelp(!help)}>{help ? t('Ocultar ayuda') : t('Ver ayuda')}</button>
        {i > 6 && <button class="btn ghost small" onClick={async () => {
          if (!await ask(t('¿Borrar el proceso {id}?', { id: pr.id }), t('Borrar'))) return;
          update((q) => { q.processes.splice(i, 1); }); go('procesos', { process: RESPONSES(p) });
        }}>{t('Borrar')}</button>}
      </div>
      <div class="proc-body">
        <CodeEditor key={pr.id} ref_={edRef} value={pr.source} errors={errs.filter((e) => e.id === pr.id)}
          line={store.view.sel.line}
          onInput={(v) => update((q) => { q.processes[i].source = v; }, { coalesce: true })} />
        {help && <Help onInsert={(t) => edRef.current?.insert(t)} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ colores
function classify(tok, ctx) {
  if (tok.startsWith('"')) return 'str';
  if (tok.startsWith('$')) return 'label';
  if (/^-?\d+$/.test(tok)) return 'n';
  const t = tok.replace(/^@/, '').replace(/^\[|\]$/g, '');
  if (BY_NAME[t.toUpperCase()] && ctx.first) return 'kw';
  if (t in SYSTEM_FLAGS || ctx.flags.has(t)) return 'flag';
  if (ctx.locs.has(t)) return 'loc';
  if (ctx.objs.has(t)) return 'obj';
  if (ctx.msgs.has(t) || ctx.procs.has(t) || ctx.pics.has(t)) return 'ref';
  if (t in SPECIAL_LOCS || t in CONSTANTS) return 'const';
  if (t === '_' || /^[A-ZÑÜ0-9]+$/.test(t)) return 'word';
  return 'unk';
}
function highlight(src, ctx, errLines) {
  return src.split('\n').map((line, li) => {
    const parts = [];
    const cm = commentStart(line);
    const code = line.slice(0, cm), comment = line.slice(cm);
    const isHeader = /^\s*>/.test(code);
    let k = 0;                    // número de pieza (sin contar el >)
    const re = /("([^"\\]|\\.)*"?)|(\s+)|(>)|([^\s>]\S*)/g;
    let m;
    while ((m = re.exec(code))) {
      const s = m[0];
      if (m[3]) { parts.push(s); continue; }
      if (m[4] && isHeader && k === 0) { parts.push(<span class="t-hdr">{s}</span>); continue; }
      let cls;
      if (isHeader && k < 2) cls = 'word';
      else cls = classify(s, { ...ctx, first: k === (isHeader ? 2 : 0) });
      parts.push(<span class={'t-' + cls}>{s}</span>);
      k++;
    }
    if (comment) parts.push(<span class="t-com">{comment}</span>);
    return <div class={'cl' + (errLines.has(li + 1) ? ' err' : '')}>{parts.length ? parts : '\u200b'}</div>;
  });
}
function commentStart(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inStr = !inStr;
    else if (line[i] === ';' && !inStr) return i;
  }
  return line.length;
}

function CodeEditor({ value, onInput, errors, ref_, line }) {
  const p = store.project;
  const ta = useRef(), pre = useRef(), gut = useRef();
  const [v, setV] = useState(value);
  useEffect(() => { if (value !== v) setV(value); }, [value]);
  const ctx = {
    locs: new Set(p.locations.map((x) => x.id)), objs: new Set(p.objects.map((x) => x.id)),
    msgs: new Set(p.messages.map((x) => x.id)), procs: new Set(p.processes.map((x) => x.id)),
    pics: new Set((p.pictures || []).map((x) => x.id)), flags: new Set((p.flags || []).map((x) => x.name)),
  };
  const errLines = new Set(errors.map((e) => e.line));
  const lines = v.split('\n').length;
  const sync = () => { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; gut.current.scrollTop = ta.current.scrollTop; };
  useEffect(() => {
    if (ref_) ref_.current = {
      insert: (t) => {
        const el = ta.current;
        el.focus();
        el.setRangeText(t, el.selectionStart, el.selectionEnd, 'end');
        setV(el.value); onInput(el.value);
      },
    };
  });
  // Ir a una línea (desde la lista de errores)
  useEffect(() => {
    if (!line || !ta.current) return;
    const el = ta.current;
    const idx = v.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    el.focus();
    el.selectionStart = el.selectionEnd = idx;
    el.scrollTop = Math.max(0, (line - 5) * 20);
    sync();
  }, [line]);
  // Cambia el texto y deja el cursor en su sitio sin esperar a repintar
  const replace = (el, from, to, text) => {
    el.setRangeText(text, from, to, 'end');
    setV(el.value); onInput(el.value);
  };
  const onKey = (e) => {
    const el = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      replace(el, el.selectionStart, el.selectionEnd, '    ');
    } else if (e.key === 'Enter') {
      // mantiene la sangría de la línea
      e.preventDefault();
      const cur = el.value.slice(0, el.selectionStart).split('\n').pop();
      let ind = /^\s*/.exec(cur)[0];
      if (/^\s*>/.test(cur)) ind = '    ';
      replace(el, el.selectionStart, el.selectionEnd, '\n' + ind);
    }
  };
  return (
    <div class="code">
      <div class="gutter" ref={gut} aria-hidden="true">
        {Array.from({ length: lines }, (_, k) => <div class={errLines.has(k + 1) ? 'err' : ''}>{k + 1}</div>)}
      </div>
      <div class="code-area">
        <pre ref={pre} aria-hidden="true">{highlight(v, ctx, errLines)}</pre>
        <textarea ref={ta} value={v} spellcheck={false} aria-label={t('Código del proceso')}
          onInput={(e) => { setV(e.currentTarget.value); onInput(e.currentTarget.value); }}
          onScroll={sync} onKeyDown={onKey} />
      </div>
      {errors.length > 0 && (
        <ul class="code-errors">
          {errors.slice(0, 8).map((e) => <li onClick={() => go('procesos', { line: e.line, process: e.id })}>{t('Línea {n}: ', { n: e.line })}{e.msg}</li>)}
        </ul>
      )}
    </div>
  );
}

const GROUPS = [
  ['Condiciones', (c) => c.cond],
  ['Objetos', (c) => [40, 41, 42, 39, 44, 43, 45, 46, 102, 90, 91, 30, 31, 32, 33, 34, 104, 105, 121, 127, 119, 123, 100, 56, 89, 94, 93].includes(c.code)],
  ['Banderas y movimiento', (c) => [47, 48, 51, 49, 50, 71, 72, 125, 126, 95, 106, 37].includes(c.code)],
  ['Texto y pantalla', (c) => [38, 77, 54, 19, 52, 57, 53, 27, 60, 74, 29, 78, 82, 107, 109, 99, 118, 97, 98, 65, 66, 67, 81, 84, 28].includes(c.code)],
  ['Control', (c) => [75, 108, 85, 116, 117, 21, 110, 22, 103, 23, 73, 92, 36, 24, 35, 83, 96].includes(c.code)],
  ['Otros', (c) => [25, 26, 62, 63, 64, 18, 61, 101, 87, 86].includes(c.code)],
];
const TYPE_ES = { loc: 'localidad', 'loc+': 'localidad', obj: 'objeto', flag: 'bandera', msg: 'mensaje', sys: 'nº', proc: 'proceso', val: 'valor',
  verb: 'verbo', noun: 'nombre', adj: 'adjetivo', adv: 'adverbio', prep: 'preposición', pct: '%', skip: 'salto', win: 'ventana' };
const DOCS = () => (getLang() === 'en' ? DOC_EN : DOC);

function Help({ onInsert }) {
  const [q, setQ] = useState('');
  return (
    <aside class="help">
      <input type="search" placeholder={t('Buscar condacto')} aria-label={t('Buscar condacto')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      <p class="note">{t('Una entrada empieza con «> VERBO NOMBRE» (o _ para cualquiera). Debajo, un condacto por línea: las condiciones que fallan pasan a la entrada siguiente. Pulsa un condacto para escribirlo.')}</p>
      {GROUPS.map(([g, f]) => {
        const D = DOCS();
        const list = CONDACTS.filter((c) => c && f(c) && (!q || c.name.includes(q.toUpperCase()) || (D[c.name] || '').toLowerCase().includes(q.toLowerCase())));
        if (!list.length) return null;
        return (
          <section>
            <h4>{t(g)}</h4>
            <dl>
              {list.map((c) => (
                <div class="cd" onClick={() => onInsert(c.name + (c.types.length ? ' ' : ''))}>
                  <dt>{c.name} <span class="args">{c.types.map((x) => t(TYPE_ES[x])).join(' ')}</span></dt>
                  <dd>{D[c.name] || ''}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </aside>
  );
}
