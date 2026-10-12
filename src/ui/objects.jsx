// Objetos.
import { store, update, go, allIds, renameId, freeId } from './store.js';
import { Field, LazyInput, TextBox, Select, ItemList, validId, preview, ask } from './common.jsx';
import { vocabKey } from '../daad/engine.js';
import { t } from '../i18n.js';

const PLACES = () => [['CARRIED', t('Lo lleva el jugador')], ['WORN', t('Lo lleva puesto')], ['NOTCREATED', t('No existe todavía')]];

// Busca la palabra en el vocabulario y, si no está, la añade con el primer
// valor libre (desde 50 para nombres, que así cambian el pronombre).
export function ensureWord(q, word, type) {
  const key = vocabKey(word);
  if (!key || key === '_') return '_';
  const found = q.vocab.find((w) => vocabKey(w.word) === key);
  if (found) return found.word;
  const used = new Set(q.vocab.filter((w) => w.type === type).map((w) => w.value));
  let v = type === 'noun' ? 50 : 2;
  while (used.has(v)) v++;
  q.vocab.push({ word: word.toUpperCase(), value: v, type });
  return word.toUpperCase();
}

export function ObjectsPanel() {
  const p = store.project;
  const sel = store.view.sel.object ?? p.objects[0]?.id;
  const i = p.objects.findIndex((o) => o.id === sel);
  const add = () => {
    let id;
    update((q) => {
      const en = q.meta.language === 'en';
      id = freeId(en ? 'object' : 'objeto', allIds(q));
      q.objects.push({ id, text: en ? 'An object.' : 'Un objeto.', noun: '_', adj: '_', loc: q.locations[1]?.id ?? 'NOTCREATED', weight: 1, container: false, wearable: false, attrs: 0 });
    });
    go('objetos', { object: id });
  };
  return (
    <div class="split">
      <ItemList
        items={p.objects.map((o, n) => ({ key: o.id, n, o }))}
        selected={sel}
        onSelect={(id) => go('objetos', { object: id })}
        filterText={(it) => it.o.id + ' ' + it.o.text}
        onAdd={add} addLabel={t('Nuevo')}
        render={(it) => (<><span class="num">{it.n}</span><b>{it.o.id}</b><small>{preview(it.o.text, 40)}</small></>)}
      />
      {i >= 0 ? <ObjectEditor o={p.objects[i]} index={i} /> : <div class="detail empty-state">{t('Todavía no hay objetos. Crea el primero con el botón Nuevo.')}</div>}
    </div>
  );
}

function ObjectEditor({ o, index }) {
  const p = store.project;
  const set = (fn, coalesce) => update((q) => fn(q.objects[index]), { coalesce });
  const taken = allIds(p);
  const inVocab = (w, type) => w === '_' || p.vocab.some((x) => vocabKey(x.word) === vocabKey(w) && x.type === type);
  const containers = p.objects.filter((x) => x.container && x.id !== o.id);
  return (
    <div class="detail">
      <div class="detail-head">
        <span class="num big">{index}</span>
        <LazyInput class="id-input" value={o.id} validate={(v) => validId(v, taken, o.id)}
          onCommit={(v) => { update((q) => renameId(q, o.id, v)); go('objetos', { object: v }); }} />
        <span class="spacer" />
        {index === 0 && <span class="note">{t('El objeto 0 es la fuente de luz para las localidades oscuras.')}</span>}
        <button class="btn ghost" onClick={async () => {
          if (!await ask(t('¿Borrar el objeto {id}?', { id: o.id }), t('Borrar'))) return;
          update((q) => { q.objects.splice(index, 1); });
          go('objetos', { object: undefined });
        }}>{t('Borrar')}</button>
      </div>
      <Field label={t('Texto')} hint={p.meta.language === 'en'
        ? t('Lo que se ve en las listas. Con _ en un mensaje se escribe hasta el primer punto y sin la primera palabra: «A brass lamp. It is lit» se nombra «brass lamp», así que el mensaje dice «the _».')
        : t('Lo que se ve en las listas. Con _ en un mensaje se escribe con artículo determinado hasta el primer punto: «Una linterna. Está encendida» se nombra «la linterna».')} wide>
        <TextBox rows={3} value={o.text} onInput={(v) => set((x) => { x.text = v; }, true)} />
      </Field>
      <div class="row wrap">
        <Field label={t('Nombre')} hint={inVocab(o.noun, 'noun') ? t('Palabra con la que el jugador lo nombra.') : t('No está en el vocabulario: se añadirá.')}>
          <LazyInput value={o.noun} onCommit={(v) => update((q) => { q.objects[index].noun = ensureWord(q, v.trim() || '_', 'noun'); })} />
        </Field>
        <Field label={t('Adjetivo')} hint={t('Opcional, para distinguir objetos con el mismo nombre.')}>
          <LazyInput value={o.adj} onCommit={(v) => update((q) => { q.objects[index].adj = ensureWord(q, v.trim() || '_', 'adjective'); })} />
        </Field>
      </div>
      <div class="row wrap">
        <Field label={t('Al empezar está')}>
          <Select value={o.loc} onChange={(v) => set((x) => { x.loc = v; })}
            options={[...PLACES(), ...p.locations.map((l) => [l.id, t('En {id}', { id: l.id })]), ...containers.map((c) => [c.id, t('Dentro de {id}', { id: c.id })])]} />
        </Field>
        <Field label={t('Peso')} hint={t('De 0 a 63.')}>
          <input type="number" min="0" max="63" value={o.weight} onInput={(e) => set((x) => { x.weight = +e.currentTarget.value; }, true)} />
        </Field>
      </div>
      <div class="row wrap checks">
        <label><input type="checkbox" checked={o.container} onChange={(e) => set((x) => { x.container = e.currentTarget.checked; })} /> {t('Es un contenedor')}</label>
        <label><input type="checkbox" checked={o.wearable} onChange={(e) => set((x) => { x.wearable = e.currentTarget.checked; })} /> {t('Se puede poner')}</label>
      </div>
      {o.container && <p class="note">{t('Lo que se mete en un contenedor va a la localidad con su mismo número ({n}). Esa localidad no debería ser un sitio del juego.', { n: index })}</p>}
      <details class="field wide">
        <summary>{t('Atributos (0 a 15, para HASAT)')}</summary>
        <div class="attrs">
          {Array.from({ length: 16 }, (_, b) => (
            <label><input type="checkbox" checked={!!(o.attrs & (1 << b))} onChange={(e) => set((x) => { x.attrs = e.currentTarget.checked ? x.attrs | (1 << b) : x.attrs & ~(1 << b); })} /> {b}</label>
          ))}
        </div>
      </details>
    </div>
  );
}
