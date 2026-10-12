// Dibujos: imagen maestra en alta resolución (se dibuja aquí o se importa)
// y su conversión a pantalla de Spectrum.
import { useEffect, useRef, useState } from 'preact/hooks';
import { store, update, go, allIds, renameId, freeId } from './store.js';
import { Field, LazyInput, ItemList, validId, pickFile, readDataURL, ask } from './common.jsx';
import { convertToZX, zxToRGBA } from '../gfx/zxconvert.js';
import { packBitmap } from '../gfx/zxpack.js';
import { ZX_PALETTE } from '../web/view.js';
import { t } from '../i18n.js';
import { VectorEditor } from './vector.jsx';

const SCALE = 4;                     // la maestra tiene 4 veces la resolución del Spectrum
const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const SWATCHES = [...ZX_PALETTE.normal.map(hex), ...ZX_PALETTE.bright.slice(1).map(hex), '#8a5a2b', '#c9a36b', '#5f7f3a', '#9fb7c9', '#7a7a7a'];

export function PicturesPanel() {
  const p = store.project;
  const pics = p.pictures || [];
  const sel = store.view.sel.picture ?? pics[0]?.id;
  const i = pics.findIndex((x) => x.id === sel);
  const add = () => {
    let id;
    update((q) => {
      id = freeId(q.meta.language === 'en' ? 'picture' : 'dibujo', allIds(q));
      (q.pictures ||= []).push({ id, zx: null, master: null, area: { cx: 0, cy: 0, cw: 32, ch: 12 }, options: { dither: true, bright: true, contrast: 1 } });
    });
    go('dibujos', { picture: id });
  };
  const addVector = () => {
    let id;
    update((q) => {
      id = freeId(q.meta.language === 'en' ? 'picture' : 'dibujo', allIds(q));
      (q.pictures ||= []).push({ id, drawstring: [7], location: true, line: 0, col: 0, height: q.settings?.textTop ?? 12, width: 42, paper: 0, ink: 7 });
    });
    go('dibujos', { picture: id });
  };
  return (
    <div class="split">
      <ItemList items={pics.map((x) => ({ key: x.id, x }))} selected={sel}
        onSelect={(id) => go('dibujos', { picture: id })} filterText={(it) => it.x.id}
        onAdd={add} addLabel={t('Nuevo')} extra={<button class="btn small" title={t('Nuevo dibujo vectorial: órdenes de líneas y rellenos, como los de PAW y DAAD')} onClick={addVector}>{t('Vectorial')}</button>}
        render={(it) => (<><b>{it.x.id}</b><small>{it.x.drawstring ? t('vectorial') + ' · ' : ''}{usedIn(p, it.x.id).join(', ') || t('sin usar')}</small></>)} />
      {i >= 0 ? (pics[i].drawstring ? <VectorEditor key={pics[i].id} pic={pics[i]} index={i} /> : <PictureEditor key={pics[i].id} pic={pics[i]} index={i} />) : (
        <div class="detail empty-state">
          <p>{t('No hay dibujos. Crea uno con el botón Nuevo: puedes dibujarlo aquí o importar una imagen.')}</p>
          <p class="note">{t('Cada dibujo se guarda en alta resolución para la versión web y se convierte a la pantalla del Spectrum (dos colores por cuadro de 8x8) para las versiones de 128K.')}</p>
          <p class="note">{t('Con el botón Vectorial el dibujo se hace con órdenes de líneas y rellenos, como en PAW y DAAD: ocupa muy poco y cabe de sobra en el 48K.')}</p>
        </div>
      )}
    </div>
  );
}
const usedIn = (p, id) => p.locations.filter((l) => l.picture === id).map((l) => l.id);

function PictureEditor({ pic, index }) {
  const p = store.project;
  const area = pic.area || { cx: 0, cy: 0, cw: 32, ch: 12 };
  const W = area.cw * 8 * SCALE, H = area.ch * 8 * SCALE;
  const opts = pic.options || { dither: true, bright: true, contrast: 1 };
  const master = useRef(), zxCanvas = useRef();
  const [packed, setPacked] = useState(null);
  const taken = allIds(p);
  const set = (fn) => update((q) => fn(q.pictures[index]));

  // Al abrir: cargar la maestra (o el vectorial, si viene de PAW)
  useEffect(() => {
    const c = master.current, ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    if (pic.master) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); convert(); };
      img.src = pic.master;
    } else if (pic.zx) {
      // sin maestra (p. ej. importado de PAW): se parte de la versión Spectrum
      const bm = { cw: pic.zx.cw, ch: pic.zx.ch, pixels: unb64(pic.zx.pixels), attrs: unb64(pic.zx.attrs) };
      const tmp = document.createElement('canvas'); tmp.width = bm.cw * 8; tmp.height = bm.ch * 8;
      tmp.getContext('2d').putImageData(new ImageData(zxToRGBA(bm), tmp.width, tmp.height), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, c.width, c.height);
      showZX(bm);
    } else convert();
  }, [pic.id, W, H]);

  function showZX(bm) {
    const z = zxCanvas.current;
    if (!bm) { setPacked(null); return; }
    z.width = bm.cw * 8; z.height = bm.ch * 8;
    z.getContext('2d').putImageData(new ImageData(zxToRGBA(bm), z.width, z.height), 0, 0);
    setPacked(packBitmap(bm, area.cx, area.cy).length);
  }
  // Convierte la maestra a Spectrum y guarda las dos cosas en el proyecto
  function convert(o = opts, save = false) {
    const c = master.current;
    const small = document.createElement('canvas');
    small.width = area.cw * 8; small.height = area.ch * 8;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(c, 0, 0, small.width, small.height);
    const rgba = sctx.getImageData(0, 0, small.width, small.height).data;
    const bm = convertToZX(rgba, area.cw, area.ch, { dither: o.dither, allowBright: o.bright, contrast: o.contrast });
    showZX(bm);
    if (save) {
      const url = c.toDataURL('image/png');
      update((q) => {
        const x = q.pictures[index];
        x.master = url;
        x.zx = { cx: area.cx, cy: area.cy, cw: area.cw, ch: area.ch, pixels: b64(bm.pixels), attrs: b64(bm.attrs) };
      }, { coalesce: true });
    }
  }
  const setOpt = (k, v) => { const o = { ...opts, [k]: v }; set((x) => { x.options = o; }); convert(o, true); };

  const importImage = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const url = await readDataURL(f);
    const img = new Image();
    img.onload = () => {
      const c = master.current, ctx = c.getContext('2d');
      // recorta para llenar la zona sin deformar
      const s = Math.max(c.width / img.width, c.height / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      convert(opts, true);
    };
    img.src = url;
  };

  return (
    <div class="detail pic">
      <div class="detail-head">
        <LazyInput class="id-input" value={pic.id} validate={(v) => validId(v, taken, pic.id)}
          onCommit={(v) => { update((q) => renameId(q, pic.id, v)); go('dibujos', { picture: v }); }} />
        <span class="spacer" />
        <button class="btn" onClick={importImage}>{t('Importar imagen')}</button>
        <button class="btn ghost" onClick={async () => {
          if (!await ask(t('¿Borrar el dibujo {id}?', { id: pic.id }), t('Borrar'))) return;
          update((q) => { q.pictures.splice(index, 1); for (const l of q.locations) if (l.picture === pic.id) delete l.picture; });
          go('dibujos', { picture: undefined });
        }}>{t('Borrar')}</button>
      </div>
      <Paint canvasRef={master} width={W} height={H} onDone={() => convert(opts, true)} />
      <div class="zx-preview">
        <div>
          <span class="field-label">{t('Así queda en el Spectrum')}</span>
          <canvas ref={zxCanvas} class="zx-pic" width={area.cw * 8} height={area.ch * 8} />
          {packed != null && <span class="note">{t('Ocupa {n} bytes en el 128K.', { n: packed })}</span>}
        </div>
        <div class="zx-opts">
          <label class="check"><input type="checkbox" checked={opts.dither} onChange={(e) => setOpt('dither', e.currentTarget.checked)} /> {t('Tramado')}</label>
          <label class="check"><input type="checkbox" checked={opts.bright} onChange={(e) => setOpt('bright', e.currentTarget.checked)} /> {t('Colores con brillo')}</label>
          <label class="check">{t('Contraste')} <input type="range" min="0.6" max="1.8" step="0.05" value={opts.contrast} onChange={(e) => setOpt('contrast', +e.currentTarget.value)} /></label>
          <Field label={t('Filas que ocupa')} hint={t('De la fila 0 hacia abajo. La plantilla deja 12 filas para el dibujo.')}>
            <input type="number" min="1" max="24" value={area.ch} onChange={(e) => set((x) => { x.area = { ...area, ch: Math.max(1, Math.min(24, +e.currentTarget.value)) }; x.height = x.area.ch; })} />
          </Field>
          <div class="field">
            <span class="field-label">{t('Localidades con este dibujo')}</span>
            {p.locations.map((l) => (
              <label class="check"><input type="checkbox" checked={l.picture === pic.id}
                onChange={(e) => update((q) => { const L = q.locations.find((x) => x.id === l.id); if (e.currentTarget.checked) L.picture = pic.id; else delete L.picture; })} /> {l.id}</label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ dibujo
const TOOLS = () => [['pincel', t('Pincel')], ['linea', t('Línea')], ['rect', t('Rectángulo')], ['elipse', t('Elipse')], ['relleno', t('Rellenar')], ['goma', t('Goma')], ['gotero', t('Coger color')]];

function Paint({ canvasRef, width, height, onDone }) {
  const [tool, setTool] = useState('pincel');
  const [color, setColor] = useState('#d7d700');
  const [size, setSize] = useState(8);
  const [filled, setFilled] = useState(true);
  const preview = useRef();
  const history = useRef([]);
  const drag = useRef(null);
  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * width / r.width), Math.round((e.clientY - r.top) * height / r.height)];
  };
  const ctx = () => canvasRef.current.getContext('2d');
  const remember = () => {
    history.current.push(ctx().getImageData(0, 0, width, height));
    if (history.current.length > 30) history.current.shift();
  };
  const undoPaint = () => { const d = history.current.pop(); if (d) { ctx().putImageData(d, 0, 0); onDone(); } };
  const shape = (c, a, b) => {
    c.strokeStyle = c.fillStyle = color; c.lineWidth = size; c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    if (tool === 'linea') { c.moveTo(...a); c.lineTo(...b); c.stroke(); return; }
    if (tool === 'rect') { const [x, y] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; const [w, h] = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; if (filled) c.fillRect(x, y, w, h); else c.strokeRect(x, y, w, h); return; }
    if (tool === 'elipse') { c.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2); if (filled) c.fill(); else c.stroke(); }
  };
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = pos(e);
    if (tool === 'gotero') { const d = ctx().getImageData(pt[0], pt[1], 1, 1).data; setColor(hex([d[0], d[1], d[2]])); return; }
    remember();
    if (tool === 'relleno') { floodFill(ctx(), width, height, pt, color); onDone(); return; }
    drag.current = { start: pt, last: pt };
    if (tool === 'pincel' || tool === 'goma') stroke(pt, pt);
  };
  const stroke = (a, b) => {
    const c = ctx();
    c.strokeStyle = tool === 'goma' ? '#000000' : color; c.lineWidth = size; c.lineCap = 'round';
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
  };
  const move = (e) => {
    if (!drag.current) return;
    const pt = pos(e);
    if (tool === 'pincel' || tool === 'goma') { stroke(drag.current.last, pt); drag.current.last = pt; return; }
    const pc = preview.current.getContext('2d');
    pc.clearRect(0, 0, width, height);
    shape(pc, drag.current.start, pt);
  };
  const up = (e) => {
    if (!drag.current) return;
    const pt = pos(e);
    if (['linea', 'rect', 'elipse'].includes(tool)) { preview.current.getContext('2d').clearRect(0, 0, width, height); shape(ctx(), drag.current.start, pt); }
    drag.current = null;
    onDone();
  };
  return (
    <div class="paint">
      <div class="paint-tools" role="toolbar" aria-label={t('Herramientas de dibujo')}>
        {TOOLS().map(([k, t]) => <button class={'tool' + (tool === k ? ' sel' : '')} aria-pressed={tool === k} onClick={() => setTool(k)}>{t}</button>)}
        <span class="sep" />
        <label class="check">{t('Grosor')} <input type="range" min="1" max="48" value={size} onInput={(e) => setSize(+e.currentTarget.value)} /></label>
        {(tool === 'rect' || tool === 'elipse') && <label class="check"><input type="checkbox" checked={filled} onChange={(e) => setFilled(e.currentTarget.checked)} /> {t('Relleno')}</label>}
        <button class="tool" onClick={undoPaint}>{t('Deshacer trazo')}</button>
      </div>
      <div class="swatches">
        <input type="color" value={color} onInput={(e) => setColor(e.currentTarget.value)} aria-label={t('Color')} />
        {SWATCHES.map((c) => <button class={'sw' + (c === color ? ' sel' : '')} style={{ background: c }} aria-label={t('Color') + ' ' + c} onClick={() => setColor(c)} />)}
      </div>
      <div class="paint-area" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas ref={canvasRef} width={width} height={height} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
        <canvas ref={preview} width={width} height={height} class="paint-preview" />
      </div>
    </div>
  );
}

function floodFill(ctx, w, h, [x0, y0], color) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const at = (x, y) => (y * w + x) * 4;
  const t = d.slice(at(x0, y0), at(x0, y0) + 4);
  const c = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  const near = (i) => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) < 48;
  if (Math.abs(t[0] - c[0]) + Math.abs(t[1] - c[1]) + Math.abs(t[2] - c[2]) < 3) return;
  const seen = new Uint8Array(w * h);
  const stack = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
    const i = at(x, y);
    if (!near(i)) continue;
    seen[y * w + x] = 1;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(img, 0, 0);
}
