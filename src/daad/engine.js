// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Intérprete DAAD en JavaScript.
//
// Ejecuta el modelo (ver ddb.js) con la misma semántica que los intérpretes
// originales de 8 bits. Lo que el manual de 1991 deja en el aire se ha fijado
// comparando con el intérprete español de Spectrum (test/ref).
//
// La salida y la entrada van por un objeto "io" (ver io-text.js y la pantalla
// del Spectrum). Todas sus llamadas que pueden esperar al jugador son async.

import { CONDACTS, F, LOC } from './condacts.js';

class Restart { }
class Exit { constructor(code) { this.code = code; } }
export class GameError extends Error {
  constructor(n, where) { super(`Game Error ${n}${where ? ' ' + where : ''}`); this.n = n; }
}

// Resultados de un condacto
const NEXT = 0, FAIL = 1, DONE = 2, NOTDONE = 3, REDO = 4, SKIP = 5;

const PUNCT = '.,;:!?';
const SUFFIXES = ['LOS', 'LAS', 'LO', 'LA'];

export class Engine {
  constructor(model, io, opts = {}) {
    this.m = model;
    this.io = io;
    this.english = model.language === 'en';     // DS48IE en lugar de DS48IS
    this.random = opts.random || (() => Math.floor(Math.random() * 100) + 1);
    this.flags = new Uint8Array(256);
    this.objloc = new Uint8Array(model.objs.length);
    // El intérprete tiene sitio para 256 objetos: los números que pasan del
    // último (con @, por ejemplo) leen y escriben ahí, sin dar error
    this.beyond = new Uint8Array(256);
    this.vocab = new Map();
    for (const w of model.vocab) this.vocab.set(vocabKey(w.word), w);
    this.line = '';             // línea del jugador (en mayúsculas)
    this.pos = 0;               // posición de la siguiente frase
    this.quoted = null;         // texto entre comillas de la última frase
    this.doall = null;
    this.done = false;
    this.ramsaved = null;
    this.depth = 0;
    this.lastVerbInLine = 255;
    this.trace = opts.trace || null;
  }

  // ------------------------------------------------------------------ ciclo
  async run() {
    for (;;) {
      this.initialise();
      let code;
      for (;;) {
        try {
          await this.runProcess(0);
          code = 0;      // salir de la tabla 0 vuelve al sistema
          break;
        } catch (e) {
          if (e instanceof Restart) continue;
          if (e instanceof Exit) { code = e.code; break; }
          throw e;
        }
      }
      if (code === 0) { await this.io.end?.(); return; }
      // EXIT n (n != 0) o END con respuesta afirmativa: partida nueva
      await this.io.reset?.();
    }
  }

  initialise() {
    this.flags.fill(0);
    this.objloc.fill(0);
    this.beyond.fill(0);
    this.flags[F.GFLAGS] = this.io.gflags ?? 0x80;
    this.flags[F.MAXCARRY] = 4;
    this.flags[F.STRENGTH] = 10;
    this.flags[F.PRONOUN_NOUN] = 255;
    this.flags[F.PRONOUN_ADJ] = 255;
    this.newtext();
    this.quoted = null;
    this.doall = null;
    this.done = false;
  }

  // ---------------------------------------------------------------- tablas
  async runProcess(p) {
    const table = this.m.procs[p];
    if (!table) throw new GameError(6);
    if (++this.depth > 10) throw new GameError(3);
    this.done = false;
    try {
      let i = 0, k = 0;          // entrada y condacto en curso
      let resume = false;        // volver a entrar en una entrada a mitad (DOALL)
      for (;;) {
        let exitKind = null;     // 'end' | 'done' | 'notdone'
        while (i < table.length) {
          const e = table[i];
          if (!resume) {
            if (!this.matches(e)) { i++; continue; }
            k = 0;
          }
          resume = false;
          let r = NEXT;
          for (; k < e.condacts.length; k++) {
            r = await this.exec(e.condacts[k], i, k);
            if (r !== NEXT) break;
          }
          if (r === NEXT || r === FAIL) { i++; continue; }
          if (r === DONE) { exitKind = 'done'; break; }
          if (r === NOTDONE) { exitKind = 'notdone'; break; }
          if (r === REDO) { i = 0; continue; }
          if (r === SKIP) { i = i + 1 + this.skipBy; continue; }
          if (r === 'doall-next') { resume = true; continue; }
        }
        if (!exitKind) exitKind = 'end';
        // Al salir de la tabla que contiene un DOALL activo se pasa al
        // siguiente objeto y se continúa tras el DOALL.
        const d = this.doall;
        if (d && d.depth === this.depth) {
          const o = this.nextDoallObject(d.obj + 1);
          if (o >= 0) {
            d.obj = o;
            this.setDoallLS(o);
            i = d.entry; k = d.condact + 1; resume = true;
            continue;
          }
          this.doall = null;
          this.done = true;
        }
        return;
      }
    } finally {
      this.depth--;
    }
  }

  matches(e) {
    return (e.verb === 255 || e.verb === this.flags[F.VERB]) &&
           (e.noun === 255 || e.noun === this.flags[F.NOUN1]);
  }

  // -------------------------------------------------------------- condactos
  async exec(ca, entry, index) {
    const c = CONDACTS[ca.op];
    let a = ca.args[0], b = ca.args[1];
    if (ca.ind) a = this.flags[a];
    if (this.trace) this.trace(c.name, a, b);
    const f = this.flags;
    const io = this.io;
    const wasDone = this.done;
    if (!c.cond) this.done = true;
    switch (ca.op) {
      // --- condiciones
      case 0: return f[F.PLAYER] === a ? NEXT : FAIL;            // AT
      case 1: return f[F.PLAYER] !== a ? NEXT : FAIL;            // NOTAT
      case 2: return f[F.PLAYER] > a ? NEXT : FAIL;              // ATGT
      case 3: return f[F.PLAYER] < a ? NEXT : FAIL;              // ATLT
      case 4: return this.isPresent(a) ? NEXT : FAIL;            // PRESENT
      case 5: return !this.isPresent(a) ? NEXT : FAIL;           // ABSENT
      case 6: return this.loc(a) === LOC.WORN ? NEXT : FAIL;     // WORN
      case 7: return this.loc(a) !== LOC.WORN ? NEXT : FAIL;     // NOTWORN
      case 8: return this.loc(a) === LOC.CARRIED ? NEXT : FAIL;  // CARRIED
      case 9: return this.loc(a) !== LOC.CARRIED ? NEXT : FAIL;  // NOTCARR
      case 10: return this.random() <= a ? NEXT : FAIL;           // CHANCE
      case 11: return f[a] === 0 ? NEXT : FAIL;                   // ZERO
      case 12: return f[a] !== 0 ? NEXT : FAIL;                   // NOTZERO
      case 13: return f[a] === b ? NEXT : FAIL;                   // EQ
      case 14: return f[a] > b ? NEXT : FAIL;                     // GT
      case 15: return f[a] < b ? NEXT : FAIL;                     // LT
      case 16: return f[F.ADJ1] === a ? NEXT : FAIL;              // ADJECT1
      case 17: return f[F.ADVERB] === a ? NEXT : FAIL;            // ADVERB
      case 68: return f[F.PREP] === a ? NEXT : FAIL;              // PREP
      case 69: return f[F.NOUN2] === a ? NEXT : FAIL;             // NOUN2
      case 70: return f[F.ADJ2] === a ? NEXT : FAIL;              // ADJECT2
      case 55: return this.loc(a) === this.where(b) ? NEXT : FAIL;  // ISAT
      case 88: return this.loc(a) !== this.where(b) ? NEXT : FAIL;  // ISNOTAT
      case 76: return f[a] === f[b] ? NEXT : FAIL;                // SAME
      case 79: return f[a] !== b ? NEXT : FAIL;                   // NOTEQ
      case 80: return f[a] !== f[b] ? NEXT : FAIL;                // NOTSAME
      case 112: return f[a] > f[b] ? NEXT : FAIL;                 // BIGGER
      case 113: return f[a] < f[b] ? NEXT : FAIL;                 // SMALLER
      case 114: return this.lastDone ? NEXT : FAIL;               // ISDONE
      case 115: return !this.lastDone ? NEXT : FAIL;              // ISNDONE
      case 58: return this.hasat(a) ? NEXT : FAIL;                // HASAT
      case 59: return !this.hasat(a) ? NEXT : FAIL;               // HASNAT
      case 111: {                                                 // INKEY
        const k = await io.inkey?.();
        if (k == null) return FAIL;
        f[F.KEY1] = k & 255; f[F.KEY2] = 0;
        return NEXT;
      }
      case 20: {                                                  // QUIT
        await this.sysmess(12);
        const ans = await this.yesno();
        return ans === this.firstChar(30) ? NEXT : FAIL;
      }

      // --- objetos
      case 40: return this.get(a);                                // GET
      case 41: return this.drop(a);                               // DROP
      case 42: return this.wear(a);                               // WEAR
      case 39: return this.remove(a);                             // REMOVE
      case 44: this.setLoc(a, f[F.PLAYER]); this.setRef(a); return NEXT;    // CREATE
      case 43: this.setLoc(a, LOC.NOTCREATED); this.setRef(a); return NEXT; // DESTROY
      case 45: {                                                  // SWAP
        const la = this.loc(a), lb = this.loc(b);
        this.rawLoc(a, lb); this.rawLoc(b, la);
        this.setRef(b);
        return NEXT;
      }
      case 46: this.setLoc(a, this.where(b)); this.setRef(a); return NEXT; // PLACE
      case 102: this.setLoc(f[F.REFOBJ], this.where(a)); this.setRef(f[F.REFOBJ]); return NEXT; // PUTO
      case 90: return this.putin(a, b);                           // PUTIN
      case 91: return this.takeout(a, b);                         // TAKEOUT
      case 30: {                                                  // DROPALL
        for (let o = 0; o < this.objloc.length; o++)
          if (this.objloc[o] === LOC.CARRIED || this.objloc[o] === LOC.WORN) this.objloc[o] = f[F.PLAYER];
        f[F.CARRIED] = 0;
        return NEXT;
      }
      case 31: return this.auto('G');                             // AUTOG
      case 32: return this.auto('D');                             // AUTOD
      case 33: return this.auto('W');                             // AUTOW
      case 34: return this.auto('R');                             // AUTOR
      case 104: return this.auto('P', a);                         // AUTOP
      case 105: return this.auto('T', a);                         // AUTOT
      case 121: this.setLoc(b, this.loc(a)); this.setRef(b); return NEXT; // COPYOO
      case 127: this.resetObjects(); return NEXT;                 // RESET
      case 119: f[b] = this.loc(a); return NEXT;                  // COPYOF
      case 123: this.setLoc(b, f[a]); this.setRef(b); return NEXT; // COPYFO
      case 100: {                                                 // WHATO
        // llevado, puesto, presente y, si no, en cualquier sitio (el de menor
        // número, aunque no esté creado), como el intérprete de Spectrum
        let o = this.findObject([LOC.CARRIED, LOC.WORN, f[F.PLAYER]]);
        if (o < 0) o = this.findObject(null);
        if (o >= 0) this.setRef(o);
        else { f[F.REFOBJ] = 255; f.fill(0, 54, 60); }           // no lo encuentra
        return NEXT;
      }
      case 56: this.setRef(a); return NEXT;                       // SETCO
      case 89: f[b] = this.weigh(a); return NEXT;                 // WEIGH
      case 94: f[a] = this.carriedWeight(); return NEXT;          // WEIGHT
      case 93: f[F.MAXCARRY] = a; f[F.STRENGTH] = b; return NEXT; // ABILITY

      // --- banderas
      case 47: f[a] = 255; return NEXT;                           // SET
      case 48: f[a] = 0; return NEXT;                             // CLEAR
      case 51: f[a] = b; return NEXT;                             // LET
      case 49: f[a] = Math.min(255, f[a] + b); return NEXT;       // PLUS
      case 50: f[a] = Math.max(0, f[a] - b); return NEXT;         // MINUS
      case 71: f[b] = Math.min(255, f[b] + f[a]); return NEXT;    // ADD
      case 72: f[b] = Math.max(0, f[b] - f[a]); return NEXT;      // SUB
      case 125: f[b] = f[a]; return NEXT;                         // COPYFF
      case 126: f[a] = f[b]; return NEXT;                         // COPYBF
      case 95: f[a] = this.random(); return NEXT;                 // RANDOM
      case 106: {                                                 // MOVE
        const to = this.connection(f[a], f[F.VERB]);
        if (to < 0) return FAIL;
        f[a] = to;
        return NEXT;
      }
      case 37: f[F.PLAYER] = a; return NEXT;                      // GOTO

      // --- pantalla y texto
      case 38: await this.message(a); await this.print('\n'); return NEXT;  // MESSAGE
      case 77: await this.message(a); return NEXT;                // MES
      case 54: await this.sysmess(a); return NEXT;                // SYSMESS
      case 19: await this.printText(this.m.ltx[a] ?? ''); return NEXT;     // DESC
      case 52: await this.print('\n'); return NEXT;               // NEWLINE
      case 57: await this.print(' '); return NEXT;                // SPACE
      case 53: await this.print(String(f[a])); return NEXT;       // PRINT
      case 27: await this.print(String(f[a] + 256 * f[(a + 1) & 255])); return NEXT; // DPRINT
      case 60: await this.listobj(); return NEXT;                 // LISTOBJ
      case 74: await this.listat(this.where(a)); return NEXT;     // LISTAT
      case 29: await io.cls?.(); return NEXT;                     // CLS
      case 78: f[F.WINDOW] = a & 7; await io.window?.(a & 7); return NEXT; // WINDOW
      case 82: await io.winat?.(a, b); return NEXT;               // WINAT
      case 107: await io.winsize?.(a, b); return NEXT;            // WINSIZE
      case 109: await io.centre?.(); return NEXT;                 // CENTRE
      case 99: await io.printat?.(a, b); return NEXT;             // PRINTAT
      case 118: await io.tab?.(a); return NEXT;                   // TAB
      case 97: await io.saveat?.(); return NEXT;                  // SAVEAT
      case 98: await io.backat?.(); return NEXT;                  // BACKAT
      case 65: await io.paper?.(a); return NEXT;                  // PAPER
      case 66: await io.ink?.(a); return NEXT;                    // INK
      case 67: await io.border?.(a); return NEXT;                 // BORDER
      case 81: await io.mode?.(a); return NEXT;                   // MODE
      case 96: await io.inputMode?.(a, b); return NEXT;           // INPUT
      case 83: f[F.TIMEOUT] = a; f[F.TIMEOUT_FLAGS] = (f[F.TIMEOUT_FLAGS] & 0xf8) | (b & 7); return NEXT; // TIME
      case 84: {                                                  // PICTURE
        const ok = await io.picture?.(a);
        return ok === false ? FAIL : NEXT;
      }
      case 28: await io.display?.(a); return NEXT;                // DISPLAY
      case 24: await this.sysmess(16); await io.anykey(); return NEXT; // ANYKEY
      case 35: await io.pause?.(a === 0 ? 256 : a); return NEXT;  // PAUSE
      case 64: await io.beep?.(a, b); return NEXT;                // BEEP
      case 18: await io.sfx?.(a, b); return NEXT;                 // SFX
      case 87: await io.gfx?.(a, b); return NEXT;                 // GFX
      case 86: return NEXT;                                       // MOUSE
      case 61: await io.extern?.(a, b, this); return NEXT;        // EXTERN
      case 101: return NEXT;                                      // CALL

      // --- partida
      case 25: {                                                  // SAVE
        const name = await this.askFileName();
        const ok = await io.save?.(name, this.snapshot());
        if (ok === false) await this.sysmess(57);
        return NEXT;
      }
      case 26: {                                                  // LOAD
        const name = await this.askFileName();
        const s = await io.load?.(name);
        if (!s) {
          // Como el original: si falla la carga, la partida vuelve a empezar
          await this.sysmess(57);
          this.flags.fill(0); this.objloc.fill(0);
          throw new Restart();
        }
        this.restore(s, 255);
        return NEXT;
      }
      case 62: this.ramsaved = this.snapshot(); return NEXT;      // RAMSAVE
      // RAMLOAD: sin un RAMSAVE antes, la entrada se abandona (como en el
      // intérprete de Spectrum, y en PAW)
      case 63:
        if (!this.ramsaved) { this.done = wasDone; return FAIL; }
        this.restore(this.ramsaved, a); return NEXT;

      // --- análisis y control
      case 73: return await this.parse(a);                        // PARSE
      case 92: this.newtext(); return NEXT;                       // NEWTEXT
      case 36:                                                    // SYNONYM
        if (a !== 255) f[F.VERB] = a;
        if (b !== 255) f[F.NOUN1] = b;
        return NEXT;
      case 75: {                                                  // PROCESS
        await this.runProcess(a);
        this.lastDone = this.done;
        this.done = true;
        return NEXT;
      }
      case 108: return REDO;                                      // REDO
      case 85: return this.startDoall(this.where(a), entry, index); // DOALL
      case 116: this.skipBy = (a & 0x80) ? a - 256 : a; return SKIP; // SKIP
      case 117: this.doall = null; throw new Restart();           // RESTART
      case 21: {                                                  // END
        await this.sysmess(13);
        const ans = await this.yesno();
        this.doall = null;
        // "no": se acaba. Si no, como en el intérprete (627Fh): la localidad
        // pasa a 0 y se vuelve al proceso 0; banderas y objetos se quedan
        if (ans === this.firstChar(31)) throw new Exit(0);
        this.flags[F.PLAYER] = 0;
        throw new Restart();
      }
      case 110: throw new Exit(a);                                // EXIT
      case 22: return DONE;                                       // DONE
      case 103: this.done = false; return NOTDONE;                // NOTDONE
      case 23: await this.sysmess(15); return DONE;               // OK
    }
    throw new GameError(5, `(${c?.name ?? ca.op})`);
  }

  // ------------------------------------------------------------- objetos
  loc(o) {
    return o < this.objloc.length ? this.objloc[o] : this.beyond[o];
  }
  rawLoc(o, l) { if (o < this.objloc.length) this.objloc[o] = l; else this.beyond[o] = l; }
  where(l) { return l === LOC.HERE ? this.flags[F.PLAYER] : l; }
  isPresent(o) {
    const l = this.loc(o);
    return l === LOC.CARRIED || l === LOC.WORN || l === this.flags[F.PLAYER];
  }
  setLoc(o, l) {
    if (l === LOC.HERE) l = this.flags[F.PLAYER];
    const old = this.loc(o);
    if (old === LOC.CARRIED && this.flags[F.CARRIED] > 0) this.flags[F.CARRIED]--;
    if (l === LOC.CARRIED) this.flags[F.CARRIED]++;
    this.rawLoc(o, l);
  }
  setRef(o) {
    const f = this.flags, ob = this.m.objs[o];
    f[F.REFOBJ] = o;
    if (!ob) return;
    f[F.REFOBJ_LOC] = this.objloc[o];
    f[F.REFOBJ_WEIGHT] = ob.weight;
    f[F.REFOBJ_CONTAINER] = ob.container ? 128 : 0;
    f[F.REFOBJ_WEARABLE] = ob.wearable ? 128 : 0;
    f[F.REFOBJ_ATTR1] = ob.attrs >> 8;
    f[F.REFOBJ_ATTR2] = ob.attrs & 255;
  }
  resetObjects() {
    let n = 0;
    this.m.objs.forEach((o, i) => { this.objloc[i] = o.loc; if (o.loc === LOC.CARRIED) n++; });
    this.flags[F.CARRIED] = n;
  }
  hasat(v) {
    // 0..15 atributos del objeto actual; el resto, bits de las banderas 0..63
    if (v < 16) {
      const attrs = (this.flags[F.REFOBJ_ATTR1] << 8) | this.flags[F.REFOBJ_ATTR2];
      return !!(attrs & (1 << v));
    }
    const flag = 59 - (v >> 3), bit = v & 7;
    return !!(this.flags[flag] & (1 << bit));
  }
  weigh(o, level = 0) {
    const ob = this.m.objs[o];
    let w = ob.weight;
    if (ob.container && level < 10) {
      if (w === 0) return 0;
      for (let i = 0; i < this.objloc.length; i++) if (this.objloc[i] === o) w += this.weigh(i, level + 1);
    }
    return Math.min(255, w);
  }
  carriedWeight() {
    let w = 0;
    for (let i = 0; i < this.objloc.length; i++) {
      const l = this.objloc[i];
      if (l === LOC.CARRIED || l === LOC.WORN) w += this.weigh(i);
    }
    return Math.min(255, w);
  }
  // Busca el objeto de Noun(Adjective)1 en las localidades dadas, por orden.
  // locs: dónde buscar, por orden; null: en cualquier sitio
  findObject(locs, noun = this.flags[F.NOUN1], adj = this.flags[F.ADJ1]) {
    if (noun === 255) return -1;
    for (const l of locs ?? [null]) {
      for (let o = 0; o < this.objloc.length; o++) {
        const ob = this.m.objs[o];
        if (ob.noun === noun && (adj === 255 || ob.adj === adj) && (l === null || this.objloc[o] === l)) return o;
      }
    }
    return -1;
  }
  existsAnywhere(noun = this.flags[F.NOUN1], adj = this.flags[F.ADJ1]) {
    return this.m.objs.some((ob) => ob.noun === noun && (adj === 255 || ob.adj === adj));
  }

  async fail(sm) { await this.sysmess(sm); this.newtext(); return DONE; }

  async get(o) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === LOC.CARRIED || l === LOC.WORN) return this.fail(25);
    if (l !== f[F.PLAYER]) return this.fail(26);
    if (this.carriedWeight() + this.weigh(o) > f[F.STRENGTH]) return this.fail(43);
    if (f[F.CARRIED] >= f[F.MAXCARRY]) { this.doall = null; return this.fail(27); }
    this.setLoc(o, LOC.CARRIED);
    this.setRef(o);
    await this.sysmess(36);
    return NEXT;
  }
  async drop(o) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === LOC.WORN) return this.fail(24);
    if (l === f[F.PLAYER]) return this.fail(49);
    if (l !== LOC.CARRIED) return this.fail(28);
    this.setLoc(o, f[F.PLAYER]);
    this.setRef(o);
    await this.sysmess(39);
    return NEXT;
  }
  async wear(o) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === f[F.PLAYER]) return this.fail(49);
    if (l === LOC.WORN) return this.fail(29);
    if (l !== LOC.CARRIED) return this.fail(28);
    if (!this.m.objs[o].wearable) return this.fail(40);
    this.setLoc(o, LOC.WORN);
    this.setRef(o);
    await this.sysmess(37);
    return NEXT;
  }
  async remove(o) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === LOC.CARRIED || l === f[F.PLAYER]) return this.fail(50);
    if (l !== LOC.WORN) return this.fail(23);
    if (!this.m.objs[o].wearable) return this.fail(41);
    if (f[F.CARRIED] >= f[F.MAXCARRY]) return this.fail(42);
    this.setLoc(o, LOC.CARRIED);
    this.setRef(o);
    await this.sysmess(38);
    return NEXT;
  }
  async putin(o, c) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === LOC.WORN) return this.fail(24);
    if (l === f[F.PLAYER]) return this.fail(49);
    if (l !== LOC.CARRIED) return this.fail(28);
    this.setLoc(o, c);
    this.setRef(o);
    await this.sysmess(44);
    await this.printObjectName(c, false);
    await this.sysmess(51);
    return NEXT;
  }
  async takeout(o, c) {
    const f = this.flags, l = this.loc(o);
    this.setRef(o);
    if (l === LOC.CARRIED || l === LOC.WORN) return this.fail(25);
    // Si el número del contenedor coincide con la localidad del jugador, gana
    // el contenedor (como en el intérprete)
    if (l !== c && l === f[F.PLAYER]) {
      await this.sysmess(45); await this.printObjectName(c, false); await this.sysmess(51);
      this.newtext(); return DONE;
    }
    if (l !== c) {
      await this.sysmess(52); await this.printObjectName(c, false); await this.sysmess(51);
      this.newtext(); return DONE;
    }
    const cl = this.loc(c);
    if (cl !== LOC.CARRIED && cl !== LOC.WORN && this.carriedWeight() + this.weigh(o) > f[F.STRENGTH]) return this.fail(43);
    if (f[F.CARRIED] >= f[F.MAXCARRY]) { this.doall = null; return this.fail(27); }
    this.setLoc(o, LOC.CARRIED);
    this.setRef(o);
    await this.sysmess(36);
    return NEXT;
  }
  async auto(kind, cont) {
    const f = this.flags, here = f[F.PLAYER];
    const order = {
      G: [here, LOC.CARRIED, LOC.WORN],
      D: [LOC.CARRIED, LOC.WORN, here],
      W: [LOC.CARRIED, LOC.WORN, here],
      R: [LOC.WORN, LOC.CARRIED, here],
      P: [LOC.CARRIED, LOC.WORN, here],
      T: [cont, LOC.CARRIED, LOC.WORN, here],
    }[kind];
    const o = this.findObject(order);
    if (o >= 0) {
      switch (kind) {
        case 'G': return this.get(o);
        case 'D': return this.drop(o);
        case 'W': return this.wear(o);
        case 'R': return this.remove(o);
        case 'P': return this.putin(o, cont);
        case 'T': return this.takeout(o, cont);
      }
    }
    const known = f[F.NOUN1] === 255 || this.existsAnywhere();
    if (!known) return this.fail(8);
    const sm = { G: 26, D: 28, W: 28, R: 23, P: 28, T: 52 }[kind];
    if (kind === 'T') {
      await this.sysmess(52); await this.printObjectName(cont, false); await this.sysmess(51);
      this.newtext(); return DONE;
    }
    return this.fail(sm);
  }

  // ---------------------------------------------------------------- DOALL
  startDoall(l, entry, index) {
    if (this.doall) throw new GameError(4);
    this.doall = { depth: this.depth, entry, condact: index, loc: l, obj: -1 };
    this.flags[F.DOALL_OBJ] = l;
    const o = this.nextDoallObject(0);
    // Sin objetos: se sale de la tabla como con NOTDONE
    if (o < 0) { this.doall = null; this.done = false; return NOTDONE; }
    this.doall.obj = o;
    this.setDoallLS(o);
    return NEXT;
  }
  nextDoallObject(from) {
    const d = this.doall, f = this.flags;
    for (let o = from; o < this.objloc.length; o++) {
      if (this.objloc[o] !== d.loc) continue;
      const ob = this.m.objs[o];
      if (ob.noun === 255) continue;
      if (ob.noun === f[F.NOUN2] && (f[F.ADJ2] === 255 || ob.adj === f[F.ADJ2])) continue;
      return o;
    }
    return -1;
  }
  setDoallLS(o) {
    const ob = this.m.objs[o];
    this.flags[F.NOUN1] = ob.noun;
    this.flags[F.ADJ1] = ob.adj;
  }

  connection(loc, verb) {
    const list = this.m.con[loc];
    if (!list) return -1;
    for (const c of list) if (c.verb === verb) return c.loc;
    return -1;
  }

  // ---------------------------------------------------------------- texto
  async print(s) { if (s) await this.io.print(s); }

  async message(n) {
    const t = this.m.msgs[n];
    if (t === undefined) throw new GameError(7);
    await this.printText(t);
  }
  async sysmess(n) { await this.printText(this.m.sysmsgs[n] ?? ''); }
  firstChar(n) { return (this.m.sysmsgs[n] ?? '')[0]?.toUpperCase() ?? ''; }

  // Imprime un texto sustituyendo _ y @ por el objeto referenciado.
  async printText(t) {
    if (!t.includes('_') && !t.includes('@')) return this.print(t);
    let buf = '';
    const en = this.english;
    for (const ch of t) {
      if (ch === '_' || (ch === '@' && !en)) {
        buf += this.objectName(this.flags[F.REFOBJ], ch === '@');
      } else buf += ch;
    }
    return this.print(buf);
  }

  // Nombre del objeto para _ y @: el texto hasta el primer punto, con el
  // artículo indeterminado cambiado por el determinado. En inglés (DS48IE)
  // se quita la primera palabra, sea la que sea, y los espacios que la siguen
  // (los mensajes ya llevan «the _»); @ no existe.
  objectName(o, capital) {
    const t = this.m.otx[o];
    if (t === undefined) return '';
    let s = t;
    const dot = s.indexOf('.');
    if (dot >= 0) s = s.slice(0, dot);
    if (this.english) {
      const sp = s.indexOf(' ');
      return sp < 0 ? '' : s.slice(sp).replace(/^ +/, '');
    }
    const m = /^(Un|Una|Unos|Unas|un|una|unos|unas)( |$)/.exec(s);
    if (m) {
      const art = { un: 'el', una: 'la', unos: 'los', unas: 'las' }[m[1].toLowerCase()];
      s = art + s.slice(m[1].length);
    }
    if (capital && s) s = s[0].toUpperCase() + s.slice(1);
    return s;
  }
  async printObjectName(o, capital) { await this.print(this.objectName(o, capital)); }

  async listat(l, intro = false) {
    const f = this.flags;
    const list = [];
    for (let o = 0; o < this.objloc.length; o++) if (this.objloc[o] === l) list.push(o);
    f[F.OBJFLAGS] &= 0x7f;
    if (!list.length) {
      if (!intro) await this.sysmess(53);
      return;
    }
    f[F.OBJFLAGS] |= 0x80;
    if (intro) { await this.sysmess(1); }
    const continuous = !!(f[F.OBJFLAGS] & 0x40);
    if (!continuous) {
      if (intro) await this.print('\n');
      for (const o of list) { await this.printText(this.m.otx[o]); await this.print('\n'); }
      return;
    }
    for (let i = 0; i < list.length; i++) {
      let t = this.m.otx[list[i]];
      const dot = t.indexOf('.');
      if (dot >= 0) t = t.slice(0, dot);
      if (t) t = t[0].toLowerCase() + t.slice(1);
      await this.printText(t);
      if (i < list.length - 2) await this.sysmess(46);
      else if (i === list.length - 2) await this.sysmess(47);
      else await this.sysmess(48);
    }
  }
  async listobj() { await this.listat(this.flags[F.PLAYER], true); }

  // ------------------------------------------------------------ analizador
  async parse(level) {
    if (level === 0) {
      if (!this.hasMoreInput()) await this.readInput();
      const ph = this.nextPhrase();
      const ok = ph && this.buildLS(ph);
      if (!ok) this.newtext();
      return ok ? FAIL : NEXT;
    }
    // Nivel 1: la frase entre comillas de la última orden
    if (this.quoted == null) return NEXT;
    const saved = [this.line, this.pos];
    this.line = upper(this.quoted); this.pos = 0;
    this.quoted = null;
    const ph = this.nextPhrase();
    [this.line, this.pos] = saved;
    return ph && this.buildLS(ph) ? FAIL : NEXT;
  }

  newtext() { this.line = ''; this.pos = 0; }
  hasMoreInput() {
    // Quedan frases si hay algo distinto de separadores
    for (let i = this.pos; i < this.line.length; i++) if (!PUNCT.includes(this.line[i]) && this.line[i] !== ' ') return true;
    return false;
  }

  async readInput() {
    const f = this.flags;
    // la petición de orden: la de la bandera 42 si es un mensaje que existe;
    // si no, una de las cuatro (2 a 5) al azar, con los cortes del intérprete
    let p = f[F.PROMPT];
    if (!p || p >= this.m.sysmsgs.length) { const h = this.random(); p = h < 30 ? 2 : h < 60 ? 3 : h < 90 ? 4 : 5; }
    await this.sysmess(p);
    await this.io.prompt?.();       // la línea de órdenes empieza antes de SM33
    await this.sysmess(33);
    let line;
    do { line = await this.io.input(); } while (line === '');
    await this.print('\n');
    this.line = upper(line);
    this.pos = 0;
    this.lastVerbInLine = 255;
  }

  // Extrae la siguiente frase de la línea. Devuelve {words, quoted} o null si
  // la frase no vale (comillas sin cerrar).
  nextPhrase() {
    const s = this.line;
    let i = this.pos;
    while (i < s.length && (s[i] === ' ' || PUNCT.includes(s[i]))) i++;
    const words = [];
    let quoted = null;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ') { i++; continue; }
      if (PUNCT.includes(ch)) { i++; break; }
      if (ch === '"') {
        const j = s.indexOf('"', i + 1);
        if (j < 0) { this.pos = s.length; return null; }
        if (quoted == null) quoted = s.slice(i + 1, j);
        i = j + 1;
        continue;
      }
      let j = i;
      while (j < s.length && s[j] !== ' ' && s[j] !== '"' && !PUNCT.includes(s[j])) j++;
      const raw = s.slice(i, j);
      i = j;
      const w = this.vocab.get(raw.slice(0, 5));
      if (!w) continue;
      if (w.type === 'conjunction') break;
      words.push({ w, raw });
    }
    this.pos = i;
    return { words, quoted };
  }

  // Construye la sentencia lógica (banderas 33-36 y 43-45).
  buildLS({ words, quoted }) {
    const f = this.flags;
    let verb = 255, n1 = 255, a1 = 255, adv = 255, prep = 255, n2 = 255, a2 = 255;
    let slot = 0;
    const addNoun = (n, a) => {
      if (n1 === 255) { n1 = n; if (a !== 255 || !this.english) a1 = a; slot = 1; }
      else if (n2 === 255) { n2 = n; if (a !== 255 || !this.english) a2 = a; slot = 2; }
      else slot = 3;
    };
    for (const { w, raw } of words) {
      switch (w.type) {
        case 'verb':
          if (verb === 255) {
            verb = w.value;
            // Pronombre enclítico: COGERLO, EXAMINALAS... (solo en castellano).
            // Como el intérprete (6BD6h), mira cómo acaba la palabra escrita,
            // sea cual sea su largo: también HABLO o COLA
            if (!this.english && SUFFIXES.some((x) => raw.endsWith(x)))
              addNoun(f[F.PRONOUN_NOUN], f[F.PRONOUN_ADJ]);
          }
          break;
        case 'noun': addNoun(w.value, 255); break;
        case 'pronoun': addNoun(f[F.PRONOUN_NOUN], f[F.PRONOUN_ADJ]); break;
        case 'adjective':
          if (this.english) {
            // En inglés va delante: es del nombre que viene
            if (slot === 0 && a1 === 255) a1 = w.value;
            else if (slot === 1 && a2 === 255) a2 = w.value;
          } else if (slot === 1 && a1 === 255) a1 = w.value;   // en castellano, detrás
          else if (slot === 2 && a2 === 255) a2 = w.value;
          break;
        case 'adverb': if (adv === 255) adv = w.value; break;
        case 'preposition': if (prep === 255) prep = w.value; break;
      }
    }
    const typedVerb = verb !== 255;
    // Nombres de conversión (< 40) hacen de verbo: NORTE, I...
    if (verb === 255 && n1 !== 255 && n1 < 40) verb = n1;
    // Sin verbo: se usa el de la frase anterior de la misma línea
    if (verb === 255 && n1 !== 255 && this.lastVerbInLine !== 255) verb = this.lastVerbInLine;
    if (verb === 255 && n1 === 255) return false;
    f[F.VERB] = verb; f[F.NOUN1] = n1; f[F.ADJ1] = a1; f[F.ADVERB] = adv;
    f[F.PREP] = prep; f[F.NOUN2] = n2; f[F.ADJ2] = a2;
    // El pronombre pasa a ser el primer nombre de la frase que no sea propio
    // (< 50), si la frase trae verbo
    if (typedVerb && n1 !== 255 && n1 >= 50) { f[F.PRONOUN_NOUN] = n1; f[F.PRONOUN_ADJ] = a1; }
    else if (typedVerb && n2 !== 255 && n2 >= 50) { f[F.PRONOUN_NOUN] = n2; f[F.PRONOUN_ADJ] = a2; }
    this.lastVerbInLine = verb;
    this.quoted = quoted;
    return true;
  }

  async askFileName() {
    await this.sysmess(60);
    await this.io.prompt?.();       // la línea de órdenes empieza antes de SM33
    await this.sysmess(33);
    const name = await this.io.input();
    await this.print('\n');
    return name.trim().slice(0, 10) || 'partida';
  }

  async yesno() {
    await this.io.prompt?.();       // la línea de órdenes empieza antes de SM33
    await this.sysmess(33);
    const line = await this.io.input();
    await this.print('\n');
    return (line.trim()[0] ?? '').toUpperCase();
  }

  // --------------------------------------------------------- guardar/cargar
  snapshot() {
    return { flags: Array.from(this.flags), objloc: Array.from(this.objloc) };
  }
  restore(s, lastFlag) {
    for (let i = 0; i <= lastFlag && i < 256; i++) this.flags[i] = s.flags[i];
    this.objloc.set(s.objloc);
  }
}

// Clave de búsqueda en el vocabulario: 5 primeros caracteres en mayúsculas.
// El generador de números al azar de los intérpretes de Spectrum (las dos
// versiones de DAAD): SEED = 101 * (byte bajo de SEED + 1); el resultado (1 a
// 100) es el byte alto, y si sale 0 se repite. Con la SEED con la que empieza
// el intérprete, CHANCE y RANDOM dan lo mismo que en él.
export function spectrumRandom(seed = 0) {
  return () => {
    for (;;) {
      seed = 101 * (((seed & 0xff) + 1) & 0xff);
      if (seed >> 8) return seed >> 8;
    }
  };
}

export function vocabKey(word) {
  return upper(word).slice(0, 5).trimEnd();
}
function upper(s) {
  let r = '';
  for (const ch of s) {
    if (ch === 'ñ') r += 'Ñ';
    else if (ch === 'ç') r += 'Ç';
    else if (ch === 'ü') r += 'Ü';
    else if (ch >= 'a' && ch <= 'z') r += ch.toUpperCase();
    else r += ch;
  }
  return r;
}

