// Localidades y mapa.
import { store, update, go, allIds, renameId, freeId } from './store.js';
import { Field, LazyInput, TextBox, Select, ItemList, validId, preview, ask } from './common.jsx';
import { vocabKey } from '../daad/engine.js';
import { t } from '../i18n.js';

// Palabras que sirven para moverse: verbos y nombres por debajo de 14
export function movementWords(p) {
  const by = new Map();
  for (const w of p.vocab) {
    if (!((w.type === 'verb' || w.type === 'noun') && w.value < 14)) continue;
    const prev = by.get(w.value);
    if (!prev || w.word.length > prev.length) by.set(w.value, w.word);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([v, w]) => ({ value: v, word: w }));
}
const wordValue = (p, word) => p.vocab.find((w) => vocabKey(w.word) === vocabKey(word || ''))?.value;

export function LocationsPanel() {
  const p = store.project;
  const sel = store.view.sel.location ?? p.locations[1]?.id ?? p.locations[0]?.id;
  const i = p.locations.findIndex((l) => l.id === sel);
  const loc = p.locations[i];
  const add = () => update((q) => {
    const id = freeId(q.meta.language === 'en' ? 'location' : 'localidad', allIds(q));
    q.locations.push({ id, text: '', exits: [] });
    store.view.sel.location = id;
  });
  return (
    <div class="split">
      <ItemList
        items={p.locations.map((l, n) => ({ key: l.id, n, l }))}
        selected={sel}
        onSelect={(id) => go('localidades', { location: id })}
        filterText={(it) => it.l.id + ' ' + it.l.text}
        onAdd={add} addLabel={t('Nueva')}
        render={(it) => (<><span class="num">{it.n}</span><b>{it.l.id}</b><small>{preview(it.l.text, 44)}</small></>)}
      />
      {loc ? <LocationEditor loc={loc} index={i} /> : <div class="detail empty-state">{t('Crea una localidad para empezar.')}</div>}
    </div>
  );
}

function LocationEditor({ loc, index }) {
  const p = store.project;
  const moves = movementWords(p);
  const set = (fn, coalesce) => update((q) => fn(q.locations[index]), { coalesce });
  const taken = allIds(p);
  const intoHere = p.locations.filter((l) => (l.exits || []).some((e) => e.to === loc.id));
  return (
    <div class="detail">
      <div class="detail-head">
        <span class="num big">{index}</span>
        <LazyInput class="id-input" value={loc.id} validate={(v) => validId(v, taken, loc.id)}
          onCommit={(v) => { update((q) => renameId(q, loc.id, v)); go('localidades', { location: v }); }} />
        <span class="spacer" />
        {index === 0 && <span class="note">{t('La localidad 0 es donde empieza la partida (la presentación).')}</span>}
        <button class="btn ghost" onClick={async () => {
          if (!await ask(t('¿Borrar la localidad {id}? Las localidades de detrás cambian de número.', { id: loc.id }), t('Borrar'))) return;
          update((q) => { q.locations.splice(index, 1); });
          go('localidades', { location: undefined });
        }}>{t('Borrar')}</button>
      </div>
      <Field label={t('Descripción')} hint={t('#k espera una tecla, #b borra la ventana. Los saltos de línea se respetan.')} wide>
        <TextBox rows={7} value={loc.text} onInput={(v) => set((l) => { l.text = v; }, true)} />
      </Field>
      <div class="field wide">
        <span class="field-label">{t('Salidas')}</span>
        <table class="grid">
          <tbody>
            {(loc.exits || []).map((e, k) => (
              <tr key={k}>
                <td>
                  <Select value={String(wordValue(p, e.word) ?? '')} onChange={(v) => set((l) => { l.exits[k].word = moves.find((m) => String(m.value) === v)?.word ?? e.word; })}
                    options={[['', '—'], ...moves.map((m) => [String(m.value), m.word])]} />
                </td>
                <td>{t('lleva a')}</td>
                <td>
                  <Select value={e.to} onChange={(v) => set((l) => { l.exits[k].to = v; })}
                    options={[['', '—'], ...p.locations.map((l) => [l.id, l.id])]} />
                </td>
                <td><button class="btn ghost small" onClick={() => set((l) => { l.exits.splice(k, 1); })}>{t('Quitar')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="row">
          <button class="btn small" onClick={() => set((l) => { (l.exits ||= []).push({ word: moves[0]?.word ?? 'N', to: '' }); })}>{t('Añadir salida')}</button>
          {intoHere.length > 0 && <span class="note">{t('Se llega desde:')} {intoHere.map((l) => (
            <a href="#" onClick={(ev) => { ev.preventDefault(); go('localidades', { location: l.id }); }}>{l.id} </a>))}</span>}
        </div>
      </div>
      <Field label={t('Dibujo')}>
        <Select value={loc.picture || ''} onChange={(v) => set((l) => { l.picture = v || undefined; })}
          options={[['', t('Sin dibujo')], ...(p.pictures || []).map((x) => [x.id, x.id])]} />
      </Field>
      <Field label={t('Notas para ti')} hint={t('No salen en el juego.')} wide>
        <TextBox rows={2} value={loc.notes || ''} onInput={(v) => set((l) => { l.notes = v; }, true)} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ mapa
const DIRS = { 2: [0, -1], 3: [0, 1], 4: [1, 0], 5: [-1, 0], 6: [1, -1], 7: [-1, -1], 8: [1, 1], 9: [-1, 1], 10: [1, -1], 11: [-1, 1], 12: [1, 0], 13: [-1, 0] };

export function layoutMap(p) {
  const pos = new Map(), used = new Set();
  const key = (x, y) => `${x},${y}`;
  const place = (id, x, y) => {
    let r = 0;
    for (;;) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!used.has(key(x + dx, y + dy))) { pos.set(id, [x + dx, y + dy]); used.add(key(x + dx, y + dy)); return; }
      }
      r++;
    }
  };
  const byId = new Map(p.locations.map((l) => [l.id, l]));
  const start = p.locations[1] ? 1 : 0;
  const order = [];
  let row = 0;
  for (let s = start; s < p.locations.length + start; s++) {
    const l0 = p.locations[s % p.locations.length];
    if (!l0 || pos.has(l0.id)) continue;
    const comp = [];
    place(l0.id, 0, row);
    const queue = [l0.id];
    while (queue.length) {
      const id = queue.shift();
      comp.push(id);
      const [x, y] = pos.get(id);
      for (const e of byId.get(id)?.exits || []) {
        if (!byId.has(e.to) || pos.has(e.to)) continue;
        const d = DIRS[wordValue(p, e.word)] || [1, 1];
        place(e.to, x + d[0], y + d[1]);
        queue.push(e.to);
      }
    }
    order.push(comp);
    const ys = [...pos.values()].map((v) => v[1]);
    row = Math.max(...ys) + 2;
  }
  return pos;
}

export function MapPanel() {
  const p = store.project;
  const pos = layoutMap(p);
  const xs = [...pos.values()].map((v) => v[0]), ys = [...pos.values()].map((v) => v[1]);
  const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys);
  const CW = 164, CH = 86, BW = 140, BH = 46;
  const W = (Math.max(0, ...xs) - minX + 1) * CW + 40, H = (Math.max(0, ...ys) - minY + 1) * CH + 40;
  const cx = (id) => (pos.get(id)[0] - minX) * CW + 20 + BW / 2;
  const cy = (id) => (pos.get(id)[1] - minY) * CH + 20 + BH / 2;
  const sel = store.view.sel.location;
  const lines = [];
  const seen = new Set();
  for (const l of p.locations) for (const e of l.exits || []) {
    if (!pos.has(e.to)) continue;
    const k = [l.id, e.to].sort().join('|');
    const back = p.locations.find((x) => x.id === e.to)?.exits?.some((b) => b.to === l.id);
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push({ a: l.id, b: e.to, oneWay: !back, word: e.word });
  }
  return (
    <div class="mapwrap">
      <p class="note">{t('Las localidades se colocan según sus salidas. Pulsa una para editarla. Las líneas con flecha solo van en un sentido.')}</p>
      <svg class="map" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="map-arrow" />
          </marker>
        </defs>
        {lines.map((ln) => (
          <line class={'map-line' + (ln.oneWay ? ' oneway' : '')} x1={cx(ln.a)} y1={cy(ln.a)} x2={cx(ln.b)} y2={cy(ln.b)}
            marker-end={ln.oneWay ? 'url(#arrow)' : undefined} />
        ))}
        {p.locations.map((l, n) => pos.has(l.id) && (
          <g class={'map-room' + (l.id === sel ? ' sel' : '') + (n === 0 ? ' intro' : '')} onClick={() => go('localidades', { location: l.id })}>
            <rect x={cx(l.id) - BW / 2} y={cy(l.id) - BH / 2} width={BW} height={BH} rx="3" />
            <text x={cx(l.id)} y={cy(l.id) - 4} text-anchor="middle" class="map-id">{l.id.length > 17 ? l.id.slice(0, 16) + '…' : l.id}</text>
            <text x={cx(l.id)} y={cy(l.id) + 13} text-anchor="middle" class="map-num">{l.picture ? t('{n}, con dibujo', { n }) : n}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
