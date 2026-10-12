// Vocabulario, mensajes, mensajes del sistema y datos del juego.
import { useState } from 'preact/hooks';
import { store, update, go, allIds, renameId, freeId } from './store.js';
import { Field, LazyInput, TextBox, Select, validId } from './common.jsx';
import { vocabKey } from '../daad/engine.js';
import { SYSTEM_FLAGS, FIRST_USER_FLAG } from '../project/symbols.js';
import { t, getLang } from '../i18n.js';

const TYPES = () => [['verb', t('verbo')], ['noun', t('nombre')], ['adjective', t('adjetivo')], ['adverb', t('adverbio')],
  ['preposition', t('preposición')], ['conjunction', t('conjunción')], ['pronoun', t('pronombre')]];

export function VocabPanel() {
  const p = store.project;
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const rows = p.vocab.map((w, i) => ({ w, i }))
    .filter(({ w }) => (!type || w.type === type) && (!q || w.word.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.w.type.localeCompare(b.w.type) || a.w.value - b.w.value || a.w.word.localeCompare(b.w.word)));
  const dup = new Map();
  for (const w of p.vocab) { const k = vocabKey(w.word); dup.set(k, (dup.get(k) || 0) + 1); }
  return (
    <div class="page">
      <p class="note">{t('El intérprete solo mira las cinco primeras letras de cada palabra. Las palabras del mismo tipo con el mismo número son sinónimos. Los nombres por debajo de 40 sirven también de verbo (NORTE, I...) y los de debajo de 14 mueven al jugador.')}</p>
      <div class="row">
        <input type="search" placeholder={t('Buscar palabra')} aria-label={t('Buscar palabra')} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <Select value={type} onChange={setType} options={[['', t('Todos los tipos')], ...TYPES()]} />
        <button class="btn small" onClick={() => update((x) => {
          const used = new Set(x.vocab.map((w) => vocabKey(w.word)));
          let n = 1; while (used.has(vocabKey('PAL' + n))) n++;
          x.vocab.push({ word: 'PAL' + n, value: 100, type: type || 'noun' });
        })}>{t('Añadir palabra')}</button>
      </div>
      <table class="grid vocab">
        <thead><tr><th>{t('Palabra')}</th><th>{t('Tipo')}</th><th>{t('Número')}</th><th>{t('Sinónimos')}</th><th /></tr></thead>
        <tbody>
          {rows.map(({ w, i }) => {
            const syn = p.vocab.filter((x) => x !== w && x.type === w.type && x.value === w.value).map((x) => x.word);
            return (
              <tr key={i}>
                <td><LazyInput value={w.word} onCommit={(v) => update((x) => { x.vocab[i].word = v.toUpperCase().trim(); })} />
                  {dup.get(vocabKey(w.word)) > 1 && <span class="field-error">{t('Repetida (5 letras)')}</span>}</td>
                <td><Select value={w.type} onChange={(v) => update((x) => { x.vocab[i].type = v; })} options={TYPES()} /></td>
                <td><input type="number" min="1" max="254" value={w.value} onInput={(e) => update((x) => { x.vocab[i].value = +e.currentTarget.value; }, { coalesce: true })} /></td>
                <td class="muted">{syn.join(', ')}</td>
                <td><button class="btn ghost small" onClick={() => update((x) => { x.vocab.splice(i, 1); })}>{t('Quitar')}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MessagesPanel() {
  const p = store.project;
  const taken = allIds(p);
  const inline = store.compiled?.model ? store.compiled.model.msgs.length - p.messages.length : 0;
  return (
    <div class="page">
      <p class="note">{t('Los mensajes se usan desde los procesos con MESSAGE nombre. También puedes escribir el texto directamente: MESSAGE "Hola." crea el mensaje sin pasar por aquí')}{inline > 0 ? t(' (ahora hay {n} así)', { n: inline }) : ''}.</p>
      <button class="btn small" onClick={() => update((x) => { x.messages.push({ id: freeId('m', allIds(x)), text: '' }); })}>{t('Añadir mensaje')}</button>
      <div class="msglist">
        {p.messages.map((m, i) => (
          <div class="msg" key={i} id={'msg-' + m.id}>
            <div class="msg-head">
              <span class="num">{i}</span>
              <LazyInput class="id-input small" value={m.id} validate={(v) => validId(v, taken, m.id)} onCommit={(v) => update((x) => renameId(x, m.id, v))} />
              <span class="spacer" />
              <button class="btn ghost small" onClick={() => update((x) => { x.messages.splice(i, 1); })}>{t('Quitar')}</button>
            </div>
            <TextBox rows={Math.min(8, 1 + Math.ceil((m.text.length || 1) / 70))} value={m.text} onInput={(v) => update((x) => { x.messages[i].text = v; }, { coalesce: true })} />
          </div>
        ))}
      </div>
    </div>
  );
}

const SYSDOC = {
  0: 'Localidad a oscuras', 1: 'Antes de la lista de objetos', 2: 'Antes de pedir orden (al azar 2 a 5)', 6: 'No se entiende la orden',
  7: 'No se puede ir por ahí', 8: 'No se puede hacer', 9: 'Inventario: lo que se lleva', 10: 'Inventario: lo puesto', 12: 'Pregunta de FIN',
  13: 'Al terminar la partida', 15: 'OK', 16: 'Pulsa una tecla', 23: 'Quitar algo que no se lleva puesto', 24: 'Dejar algo puesto',
  25: 'Coger algo que ya se tiene', 26: 'Coger algo que no está', 27: 'No se puede llevar más', 28: 'No se tiene', 29: 'Ya puesto',
  30: 'Inicial de «sí»', 31: 'Inicial de «no»', 32: 'Más texto', 33: 'Señal de la línea de órdenes', 35: 'Tiempo de espera agotado',
  36: 'Coger', 37: 'Ponerse', 38: 'Quitarse', 39: 'Dejar', 40: 'No se puede poner', 41: 'No se puede quitar', 42: 'Manos llenas al quitarse',
  43: 'Pesa demasiado', 44: 'Meter en (sigue el contenedor)', 45: 'No está en', 46: 'Separador de la lista', 47: 'Último separador',
  48: 'Fin de la lista', 49: 'No lo tienes', 50: 'No lo llevas puesto', 51: 'Fin tras el contenedor', 52: 'No hay eso en', 53: 'Lista vacía',
  54: 'Inicial de «cinta»', 55: 'Inicial de «disco»', 56: 'Unidad no lista', 57: 'Error de E/S', 58: 'Disco lleno', 59: 'Nombre no válido',
  60: 'Pedir nombre de fichero', 61: 'Pon la cinta', 62: 'Cinta o disco',
};

export function SysPanel() {
  const p = store.project;
  return (
    <div class="page">
      <p class="note">{p.meta.language === 'en'
        ? t('Mensajes que usa el propio intérprete. _ es el nombre del objeto sin su primera palabra (por eso los mensajes dicen «the _»). Puedes añadir más al final y usarlos con SYSMESS.')
        : t('Mensajes que usa el propio intérprete. _ es el objeto con artículo y @ lo mismo con mayúscula. Puedes añadir más al final y usarlos con SYSMESS.')}</p>
      <table class="grid sys">
        <tbody>
          {p.sysmsgs.map((msg, i) => (
            <tr key={i}>
              <td class="num">{i}</td>
              <td class="muted">{SYSDOC[i] ? t(SYSDOC[i]) : (i >= 63 ? t('Tuyo') : '')}</td>
              <td><TextBox rows={1} value={msg} onInput={(v) => update((x) => { x.sysmsgs[i] = v; }, { coalesce: true })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button class="btn small" onClick={() => update((x) => { x.sysmsgs.push(''); })}>{t('Añadir mensaje del sistema')}</button>
    </div>
  );
}

export function GamePanel() {
  const p = store.project;
  const set = (fn) => update(fn, { coalesce: true });
  const usedFlags = new Set((p.flags || []).map((f) => f.num));
  return (
    <div class="page">
      <h2 class="title-edit">
        <LazyInput value={p.meta.title} onCommit={(v) => update((x) => { x.meta.title = v; })} aria-label={t('Título del juego')} />
      </h2>
      <div class="row wrap">
        <Field label={t('Autoría')}><LazyInput value={p.meta.author} onCommit={(v) => update((x) => { x.meta.author = v; })} /></Field>
        <Field label={t('Idioma del juego')} hint={t('Decide el intérprete que lleva el juego exportado (el español o el inglés) y cómo se entienden las órdenes. No traduce el vocabulario ni los mensajes: para eso, empieza un juego nuevo en el otro idioma.')}>
          <Select value={p.meta.language ?? 'es'} onChange={(v) => update((x) => { x.meta.language = v; })}
            options={[['es', t('Castellano')], ['en', t('Inglés')]]} />
        </Field>
      </div>
      <Field label={t('Descripción')} hint={t('Sale en la página publicada, debajo de la pantalla.')} wide>
        <TextBox rows={3} value={p.meta.description || ''} onInput={(v) => set((x) => { x.meta.description = v; })} />
      </Field>

      <h3>{t('Cómo está hecho un juego')}</h3>
      {getLang() === 'en' ? <GuideEN /> : <GuideES />}

      <h3>{t('Banderas')}</h3>
      <p class="note">{t('Las banderas guardan números de 0 a 255. Ponles nombre para usarlas en los procesos (ZERO puerta_abierta, SET puerta_abierta...). Las del sistema ya tienen nombre: localidad, puntos, turnos y otras (fPlayer, fScore... también valen).')}</p>
      <table class="grid">
        <thead><tr><th>{t('Nombre')}</th><th>{t('Número')}</th><th>{t('Para qué es')}</th><th /></tr></thead>
        <tbody>
          {(p.flags || []).map((f, i) => (
            <tr key={i}>
              <td><LazyInput value={f.name} validate={(v) => validId(v, allIds(p), f.name) || (v in SYSTEM_FLAGS ? t('Es una bandera del sistema') : null)}
                onCommit={(v) => update((x) => renameId(x, f.name, v))} /></td>
              <td><input type="number" min="0" max="255" value={f.num} onInput={(e) => set((x) => { x.flags[i].num = +e.currentTarget.value; })} /></td>
              <td><LazyInput value={f.comment || ''} onCommit={(v) => update((x) => { x.flags[i].comment = v; })} /></td>
              <td><button class="btn ghost small" onClick={() => update((x) => { x.flags.splice(i, 1); })}>{t('Quitar')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button class="btn small" onClick={() => update((x) => {
        let n = FIRST_USER_FLAG; while (usedFlags.has(n)) n++;
        (x.flags ||= []).push({ name: freeId(x.meta.language === 'en' ? 'flag' : 'bandera', allIds(x)), num: n, comment: '' });
      })}>{t('Añadir bandera')}</button>
    </div>
  );
}

const link = (panel, text) => <a href={'#' + panel} onClick={(e) => { e.preventDefault(); go(panel); }}>{text}</a>;

function GuideES() {
  return (
    <div class="guide">
      <p>El jugador se mueve por {link('localidades', 'localidades')} unidas por salidas y maneja {link('objetos', 'objetos')}. Lo que escribe se compara con el {link('vocabulario', 'vocabulario')} (las cinco primeras letras de cada palabra) y se convierte en una frase: verbo, nombre, adjetivo...</p>
      <p>La lógica va en los {link('procesos', 'procesos')}. Casi todo lo tuyo irá en «respuestas»: cada entrada empieza con el verbo y el nombre a los que responde y sigue con condiciones y acciones. Si una condición falla, se pasa a la entrada siguiente. Por ejemplo:</p>
      <pre>{'> ABRIR PUERTA\n    AT pasillo\n    ZERO puerta_abierta\n    SET puerta_abierta\n    MESSAGE "La puerta se abre con un chirrido."\n    DONE'}</pre>
      <p>Pulsa Probar para jugar en cualquier momento. Para publicar, usa Exportar: una página web que funciona sola, o el juego para un Spectrum, un Amstrad CPC, un Commodore 64, un MSX, un PC con DOS, un Atari ST o un Amiga (en emulador o en la máquina real).</p>
    </div>
  );
}
function GuideEN() {
  return (
    <div class="guide">
      <p>The player moves between {link('localidades', 'locations')} joined by exits and handles {link('objetos', 'objects')}. What they type is matched against the {link('vocabulario', 'vocabulary')} (the first five letters of each word) and turned into a phrase: verb, noun, adjective...</p>
      <p>The logic lives in the {link('procesos', 'processes')}. Most of your work goes into «responses» («respuestas» in a Spanish game): each entry starts with the verb and noun it answers to, followed by conditions and actions. If a condition fails, the next entry is tried. For example:</p>
      <pre>{'> OPEN DOOR\n    AT corridor\n    ZERO door_open\n    SET door_open\n    MESSAGE "The door creaks open."\n    DONE'}</pre>
      <p>Press Play to try the game at any time. To publish it, use Export: a web page that works on its own, or the game for a Spectrum, an Amstrad CPC, a Commodore 64, an MSX, a DOS PC, an Atari ST or an Amiga (on an emulator or the real machine).</p>
    </div>
  );
}
