// Probar el juego dentro del editor, con un panel de depuración.
import { useEffect, useRef, useState } from 'preact/hooks';
import { store, recompile, go } from './store.js';
import { startGame } from '../player/run.js';
import { defaultCharset } from '../spectrum/zxexport.js';
import { SYSTEM_FLAGS, SPECIAL_LOC_NAMES } from '../project/symbols.js';
import { t } from '../i18n.js';

export function PlayPanel() {
  const host = useRef();
  const ctl = useRef(null);
  const [snap, setSnap] = useState(null);
  const [hires, setHires] = useState(true);
  const [script, setScript] = useState('');
  const [run, setRun] = useState(0);
  const comp = store.compiled;
  const errors = comp?.errors || [];

  useEffect(() => {
    if (errors.length || !comp?.model) return undefined;
    const model = structuredCloneModel(comp.model);
    ctl.current = startGame(host.current, model, {
      charset: charset(), hires, gameId: 'prueba',
      onTurn: (eng) => setSnap(debugState(eng)),
    });
    return () => ctl.current?.stop();
  }, [run, hires, errors.length === 0]);

  if (errors.length) {
    return (
      <div class="page">
        <p class="warn-box">{errors.length === 1 ? t('El juego tiene 1 error y no se puede probar. Está en la lista de problemas, abajo.')
          : t('El juego tiene {n} errores y no se puede probar. Están en la lista de problemas, abajo.', { n: errors.length })}</p>
      </div>
    );
  }
  const typeScript = async () => {
    const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) ctl.current?.view.type(l);
  };
  return (
    <div class="play">
      <div class="play-main">
        <div class="play-bar">
          <button class="btn" onClick={() => { recompile(); setRun(run + 1); }}>{t('Volver a empezar')}</button>
          <label class="check"><input type="checkbox" checked={hires} onChange={(e) => setHires(e.currentTarget.checked)} /> {t('Dibujos en alta resolución')}</label>
        </div>
        <div class="game-host" ref={host} />
        <p class="note">{t('Pulsa en la pantalla y escribe. Los cambios del proyecto se ven al volver a empezar.')}</p>
      </div>
      <aside class="debug">
        <h3>{t('Ahora mismo')}</h3>
        {snap ? <Debug s={snap} /> : <p class="note">{t('Aparece al pedir la primera orden.')}</p>}
        <h3>{t('Órdenes de prueba')}</h3>
        <textarea rows={6} value={script} onInput={(e) => setScript(e.currentTarget.value)} aria-label={t('Órdenes de prueba')}
          placeholder={store.project.meta.language === 'en' ? 'n\nget torch\ni' : 'n\ncoger linterna\ni'} />
        <button class="btn small" onClick={typeScript}>{t('Escribirlas en el juego')}</button>
      </aside>
    </div>
  );
}

function charset() {
  const c = store.project.settings?.charset;
  return c ? Uint8Array.from(atob(c), (x) => x.charCodeAt(0)) : defaultCharset();
}
// El motor modifica cosas del modelo (imágenes), así que se le da una copia
function structuredCloneModel(m) {
  return { ...m, pictures: Array.from({ length: (m.pictures || []).length }, (_, i) => m.pictures[i] && { ...m.pictures[i] }) };
}

function debugState(eng) {
  const p = store.project;
  const f = eng.flags;
  const names = new Map();
  for (const x of p.flags || []) names.set(x.num, x.name);
  for (const [n, v] of Object.entries(SYSTEM_FLAGS)) if (!names.has(v) && /^[a-z]/.test(n)) names.set(v, n);
  const flags = [];
  for (let i = 0; i < 256; i++) if (f[i] && i !== 29) flags.push([i, names.get(i) || '', f[i]]);
  const loc = f[38];
  const where = (l) => SPECIAL_LOC_NAMES[l] || p.locations[l]?.id || (p.objects[l]?.container ? t('dentro de {id}', { id: p.objects[l].id }) : String(l));
  const objs = p.objects.map((o, i) => ({ id: o.id, at: eng.objloc[i] })).filter((o) => o.at === 254 || o.at === 253 || o.at === loc);
  const word = (v, types) => (v === 255 ? '' : p.vocab.find((w) => w.value === v && types.includes(w.type))?.word || v);
  return {
    loc: p.locations[loc]?.id ?? loc, flags, objs: objs.map((o) => ({ ...o, where: where(o.at) })),
    ls: [word(f[33], ['verb', 'noun']), word(f[34], ['noun']), word(f[35], ['adjective']), word(f[43], ['preposition']), word(f[44], ['noun'])].filter(Boolean).join(' '),
  };
}

function Debug({ s }) {
  return (
    <div class="dbg">
      <p>{t('Localidad:')} <a href="#" onClick={(e) => { e.preventDefault(); go('localidades', { location: s.loc }); }}>{s.loc}</a></p>
      <p>{t('Última frase:')} <b>{s.ls || '—'}</b></p>
      <h4>{t('Objetos a mano')}</h4>
      <ul>{s.objs.length ? s.objs.map((o) => <li>{o.id} <span class="muted">({o.where === 'CARRIED' ? t('lo lleva') : o.where === 'WORN' ? t('puesto') : t('aquí')})</span></li>) : <li class="muted">{t('Ninguno')}</li>}</ul>
      <h4>{t('Banderas distintas de 0')}</h4>
      <table class="grid tight"><tbody>
        {s.flags.map(([n, name, v]) => <tr><td class="num">{n}</td><td>{name}</td><td>{v}</td></tr>)}
      </tbody></table>
    </div>
  );
}
