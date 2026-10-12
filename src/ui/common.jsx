// Piezas comunes de la interfaz.
import { useState, useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n.js';

// Descargas: en una página publicada en claude.ai se usa la capacidad
// "downloads" (que solo admite ciertas extensiones: lo demás va en un .zip);
// fuera de ella, un enlace de descarga normal.
const ALLOWED = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip)$/i;
let dl;
function downloadsCap() {
  dl ??= (window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));
  return dl;
}
export async function download(name, data, mime = 'application/octet-stream') {
  const cap = await downloadsCap();
  if (cap) {
    let fname = name, payload = data;
    if (!ALLOWED.test(name)) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      payload = zipStore([[name, bytes]]);
      fname = name + '.zip';
    }
    try { await cap.save({ filename: fname, data: payload instanceof Uint8Array ? payload.slice() : payload }); return true; }
    catch (e) { if (e?.code === 'declined') return false; throw new Error(t('No se pudo guardar el fichero: ') + (e?.message || e?.code)); }
  }
  plainDownload(name, data, mime);
  return true;
}
// ZIP sin compresión con un fichero o más
export function zipStore(files) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const out = [], central = [];
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  let off = 0;
  for (const [name, data] of files) {
    const nb = new TextEncoder().encode(name), c = crc(data);
    const head = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...nb];
    central.push([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nb]);
    out.push(Uint8Array.from(head), data);
    off += head.length + data.length;
  }
  const cd = Uint8Array.from(central.flat());
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(off), 0, 0]);
  const total = new Uint8Array(off + cd.length + end.length);
  let p = 0;
  for (const b of [...out, cd, end]) { total.set(b, p); p += b.length; }
  return total;
}
function plainDownload(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// En iPadOS y iOS el selector de archivos traduce las extensiones de accept a
// tipos que el sistema conozca y descarta las demás (.z80, .tap, .ddb...): si
// en la lista queda alguna conocida (.zip), solo deja elegir esas. Allí se
// pasan solo los tipos MIME (image/*, application/json); si no hay ninguno,
// se puede elegir cualquier archivo y el importador ya mira qué es.
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));   // (iPadOS se presenta como un Mac)
export function pickFile(accept) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = IOS ? accept.split(',').filter((a) => a.includes('/')).join(',') : accept;
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}

// Confirmación dentro de la página (confirm() no funciona en todas partes)
let asker = null;
export function setAsker(fn) { asker = fn; }
export function ask(message, ok = t('Sí')) { return asker ? asker(message, ok) : Promise.resolve(window.confirm(message)); }

export const readText = (f) => f.text();
export const readBytes = async (f) => new Uint8Array(await f.arrayBuffer());
export const readDataURL = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });

export function Field({ label, hint, children, wide }) {
  return (
    <label class={'field' + (wide ? ' wide' : '')}>
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

// Campo de texto que solo avisa del cambio al salir (o con Enter)
export function LazyInput({ value, onCommit, validate, class: cls, ...rest }) {
  const [v, setV] = useState(value ?? '');
  const [err, setErr] = useState(null);
  useEffect(() => { setV(value ?? ''); setErr(null); }, [value]);
  const commit = () => {
    if (v === (value ?? '')) return;
    const e = validate?.(v);
    if (e) { setErr(e); return; }
    setErr(null);
    onCommit(v);
  };
  return (
    <span class={'lazy' + (cls ? ' ' + cls : '')}>
      <input {...rest} value={v} onInput={(e) => setV(e.currentTarget.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { setV(value ?? ''); setErr(null); } }} />
      {err && <span class="field-error">{err}</span>}
    </span>
  );
}

export function TextBox({ value, onInput, rows = 4, ...rest }) {
  return <textarea rows={rows} value={value} onInput={(e) => onInput(e.currentTarget.value)} {...rest} />;
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.currentTarget.value)} {...rest}>
      {options.map((o) => (Array.isArray(o) ? <option value={o[0]}>{o[1]}</option> : <option value={o}>{o}</option>))}
    </select>
  );
}

export const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function validId(v, taken, current) {
  if (!ID_RE.test(v)) return t('Solo letras sin acentos, números y _ (sin empezar por número)');
  if (v !== current && taken.has(v)) return t('Ese nombre ya existe');
  return null;
}

// Lista lateral con buscador
export function ItemList({ items, selected, onSelect, render, onAdd, addLabel, filterText, extra }) {
  const [q, setQ] = useState('');
  const shown = q ? items.filter((it) => filterText(it).toLowerCase().includes(q.toLowerCase())) : items;
  const ref = useRef();
  useEffect(() => { ref.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  return (
    <div class="itemlist">
      <div class="itemlist-top">
        <input type="search" placeholder={t('Buscar')} aria-label={t('Buscar')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        {onAdd && <button class="btn small" onClick={onAdd}>{addLabel}</button>}
        {extra}
      </div>
      <ul ref={ref}>
        {shown.map((it) => (
          <li key={it.key} class={it.key === selected ? 'sel' : ''} onClick={() => onSelect(it.key)}>{render(it)}</li>
        ))}
        {!shown.length && <li class="empty">{t('Nada por aquí.')}</li>}
      </ul>
    </div>
  );
}

export function preview(text, n = 60) {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s || t('(sin texto)');
}
