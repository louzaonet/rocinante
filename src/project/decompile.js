// Convierte un modelo DAAD (de un .DDB o de una importación) en un proyecto de
// Rocinante: pone nombres a localidades, objetos, mensajes y procesos y escribe
// los procesos como texto.

import { CONDACTS } from '../daad/condacts.js';
import { SYSTEM_FLAGS, SPECIAL_LOC_NAMES } from './symbols.js';
import { textOut } from './compile.js';

const STOP = new Set(['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'lo', 'de', 'del', 'en', 'y', 'a', 'al',
  'con', 'por', 'para', 'que', 'se', 'te', 'tu', 'su', 'mi', 'es', 'esta', 'estas', 'hay', 'muy',
  'the', 'an', 'some', 'of', 'you', 'are', 'in', 'is', 'on', 'to', 'and', 'with', 'it', 'its', 'this', 'there', 'at', 'by']);
const RESERVED = new Set(['CARRIED', 'WORN', 'HERE', 'NOTCREATED', '_']);

export function slug(text, max = 2) {
  const plain = (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
  const words = plain.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d/.test(w));
  return words.slice(0, max).join('_');
}

function uniq(base, used, fallback) {
  let id = base || fallback;
  if (/^\d/.test(id)) id = fallback;
  let n = 2, out = id;
  while (used.has(out) || RESERVED.has(out.toUpperCase()) || CONDACT_NAMES.has(out.toUpperCase())) out = `${id}${n++}`;
  used.add(out);
  return out;
}
const CONDACT_NAMES = new Set(CONDACTS.filter(Boolean).map((c) => c.name));

export function decompileModel(m, meta = {}) {
  const used = new Set();
  const flagName = new Map();
  for (const [name, n] of Object.entries(SYSTEM_FLAGS)) if (!flagName.has(n) && /^f[A-Z]/.test(name)) flagName.set(n, name);
  for (const n of flagName.values()) used.add(n);

  const vocabBy = new Map();
  for (const w of m.vocab) {
    const k = `${w.type}:${w.value}`;
    // de los sinónimos, el más largo (MIRAR mejor que M)
    if (!vocabBy.has(k) || w.word.length > vocabBy.get(k).length) vocabBy.set(k, w.word);
  }
  const wordName = (v, types) => {
    if (v === 255) return '_';
    for (const t of types) { const w = vocabBy.get(`${t}:${v}`); if (w) return w; }
    return String(v);
  };

  const locations = m.ltx.map((t, i) => ({ id: uniq(slug(t), used, `loc${i}`), text: textOut(t), exits: [] }));
  const objects = m.otx.map((t, i) => {
    const o = m.objs[i];
    const base = slug(t.split('.')[0]) || (o.noun !== 255 ? slug(wordName(o.noun, ['noun'])) : '');
    return {
      id: uniq(base, used, `obj${i}`), text: textOut(t),
      noun: wordName(o.noun, ['noun']), adj: wordName(o.adj, ['adjective']),
      loc: 0, weight: o.weight, container: o.container, wearable: o.wearable, attrs: o.attrs,
    };
  });
  const messages = m.msgs.map((t, i) => ({ id: uniq(`m${i}`, used, `m${i}`), text: textOut(t) }));
  const processes = m.procs.map((_, i) => ({ id: uniq(`p${i}`, used, `p${i}`), source: '' }));

  const locName = (v, special) => {
    if (special && SPECIAL_LOC_NAMES[v]) return SPECIAL_LOC_NAMES[v];
    const isCont = v < objects.length && m.objs[v].container;
    if (isCont && (v >= locations.length || !m.ltx[v])) return objects[v].id;
    if (v < locations.length) return locations[v].id;
    if (v < objects.length && m.objs[v].container) return objects[v].id;
    if (special && v === 252) return 'NOTCREATED';
    return String(v);
  };
  m.con.forEach((list, i) => {
    locations[i].exits = list.map((c) => ({ word: wordName(c.verb, ['verb', 'noun']), to: c.loc < locations.length ? locations[c.loc].id : c.loc }));
  });
  objects.forEach((o, i) => { o.loc = locName(m.objs[i].loc, true); });

  const flag = (n) => flagName.get(n) ?? String(n);
  const param = (type, v) => {
    switch (type) {
      case 'loc': return locName(v, false);
      case 'loc+': return locName(v, true);
      case 'obj': return v < objects.length ? objects[v].id : String(v);
      case 'flag': return flag(v);
      case 'msg': return v < messages.length ? messages[v].id : String(v);
      case 'proc': return v < processes.length ? processes[v].id : String(v);
      case 'verb': return wordName(v, ['verb', 'noun']);
      case 'noun': return wordName(v, ['noun']);
      case 'adj': return wordName(v, ['adjective']);
      case 'adv': return wordName(v, ['adverb']);
      case 'prep': return wordName(v, ['preposition']);
      case 'skip': return String(v & 0x80 ? v - 256 : v);
      default: return String(v);
    }
  };
  m.procs.forEach((entries, p) => {
    const out = [];
    for (const e of entries) {
      out.push(`> ${wordName(e.verb, ['verb', 'noun'])} ${wordName(e.noun, ['noun'])}`);
      for (const ca of e.condacts) {
        const c = CONDACTS[ca.op];
        const args = ca.args.map((v, i) => (i === 0 && ca.ind ? '@' + flag(v) : param(c.types[i], v)));
        let line = '    ' + [c.name, ...args].join(' ');
        if ((ca.op === 38 || ca.op === 77) && !ca.ind && m.msgs[ca.args[0]] !== undefined) {
          line = line.padEnd(28) + ' ; ' + oneLine(m.msgs[ca.args[0]]);
        } else if (ca.op === 54 && !ca.ind && m.sysmsgs[ca.args[0]] !== undefined) {
          line = line.padEnd(28) + ' ; ' + oneLine(m.sysmsgs[ca.args[0]]);
        }
        out.push(line);
      }
    }
    processes[p].source = out.join('\n') + '\n';
  });

  return {
    format: 'rocinante-proyecto', version: 1,
    meta: { title: meta.title ?? (m.language === 'en' ? 'Untitled' : 'Sin título'), author: meta.author ?? '', language: m.language ?? 'es', ...meta },
    settings: { machine: '128' },
    vocab: m.vocab.map((w) => ({ ...w })),
    flags: [],
    defines: [],
    locations, objects, messages,
    sysmsgs: m.sysmsgs.map(textOut),
    processes,
    pictures: [],
  };
}

function oneLine(t) {
  const s = t.replace(/\n/g, ' ').replace(/[\x00-\x1f]/g, '');
  return s.length > 50 ? s.slice(0, 47) + '...' : s;
}
