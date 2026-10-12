"""Ejecuta un .DDB en el intérprete DAAD original de Spectrum (emulado) y devuelve
la transcripción de lo que imprime. Sirve de referencia para las pruebas
diferenciales del motor JS.

Uso:  python3 zxdaad.py juego.ddb ordenes.txt [--png salida.png]

Cómo funciona:
- Parte de ref/base_es48.z80: ROM inicializada, intérprete DS48IS en 0x6000 y
  PC=0x6000, tal como lo deja el cargador BASIC de daadmaker.
- Sustituye la base de datos en 0x8400 por la que le pasemos.
- Engancha la rutina de impresión del intérprete (0x751C: cada carácter ya
  expandido de los tokens) para capturar el texto.
- Cuando el intérprete espera una tecla (bucle en 0x73D6) mira desde dónde se
  ha llamado: si es la entrada de órdenes, teclea la siguiente orden; si no
  (ANYKEY, "Hay más..."), pulsa espacio.
Las direcciones son del intérprete español DS48IS.P3F de la R5 de DAAD.
"""
import sys, os
from skoolkit.snapshot import Snapshot
from skoolkit.simutils import from_snapshot
from skoolkit.simulator import Simulator

HERE = os.path.dirname(os.path.abspath(__file__))

# Direcciones de cada intérprete: DS48IS (español) y DS48IE (inglés)
LANGS = {
    'es': dict(base48='base_es48.z80', base128='base_es128.pkl',
               print_hook=0x751C,   # A = carácter DAAD a imprimir
               keywait=0x73D6,      # bucle BIT 5,(IY+1) esperando tecla
               input_ret=0x71A1,    # retorno cuando la espera viene del editor de línea
               tkeywait=0x73FA,     # lo mismo con tiempo límite (TIME)...
               tinput_ret=0x718B),  # ...y su retorno al editor
    'en': dict(base48='base_en48.z80', base128='base_en128.pkl',
               print_hook=0x7457, keywait=0x7311, input_ret=0x713D, tkeywait=0x7335, tinput_ret=0x7127),
}

# Códigos 16-31 del juego de caracteres español de DAAD
ES = 'ª¡¿«»áéíóúñÑçÇüÜ'
def daad_char(c):
    if 16 <= c < 32: return ES[c - 16]
    if c == 13: return '\n'
    if c == 0x7F: return ' '
    if 32 <= c < 127: return chr(c)
    return '{%02x}' % c

def unicode_key(ch):
    """Código que el editor de línea espera para cada carácter tecleado."""
    if ch in ES: return 16 + ES.index(ch)
    return ord(ch)


class Ports:
    """Puertos: teclado sin pulsar (las teclas se inyectan en LAST_K) y
    paginación del 128K por 0x7FFD."""
    def __init__(self, sim): self.sim = sim
    def read_port(self, regs, port): return 0xFF
    def write_port(self, regs, port, value, offset=0):
        mem = self.sim.memory
        if port & 0x8002 == 0 and hasattr(mem, 'out7ffd') and not (mem.o7ffd & 32):
            mem.out7ffd(value)

def machine128(lang='es'):
    import pickle
    from skoolkit.pagingtracer import Memory
    st = pickle.load(open(os.path.join(HERE, '..', 'ref', LANGS[lang]['base128']), 'rb'))
    mem = Memory(banks=tuple(list(b) for b in st['banks']), out7ffd=st['o7ffd'])
    sim = Simulator(mem)
    for i, v in enumerate(st['regs']): sim.registers[i] = v
    return sim

def run(ddb, commands, max_frames=200000, png=None, sdg=None, machine='48', banks=None, screen=None, snap=None, keyshots=None, lang=None, watch=None, log=None):
    if lang is None:            # el idioma va en la cabecera del DDB (bit 0 del byte 1)
        if ddb is not None: hdr = ddb
        elif snap:              # 8400h: en 48K, RAM desde 4000h; en 128K, banco 2
            ram = Snapshot.get(snap).ram(-1)
            o = 0x4400 if len(ram) == 0xC000 else 2 * 0x4000 + 0x400
            hdr = ram[o:o + 2]
        else: hdr = b'\x00\x01'
        lang = 'es' if hdr[1] & 15 == 1 else 'en'
    L = LANGS[lang]
    PRINT_HOOK, KEYWAIT, INPUT_RET = L['print_hook'], L['keywait'], L['input_ret']
    WAITS, INPUTS = (KEYWAIT, L['tkeywait']), (INPUT_RET, L['tinput_ret'])
    if snap:
        sim = from_snapshot(Simulator, Snapshot.get(snap))
        machine = '128' if hasattr(sim.memory, 'out7ffd') else '48'
    elif machine == '128':
        sim = machine128(lang)
        for n, data in (banks or {}).items():
            sim.memory.banks[n][0:len(data)] = list(data)
    else:
        sim = from_snapshot(Simulator, Snapshot.get(os.path.join(HERE, '..', 'ref', L['base48'])))
    sim.set_tracer(Ports(sim))
    m = sim.memory; r = sim.registers
    if snap: ddb = None
    if ddb is None: pass
    elif sdg is not None:
        start = 0x10000 - len(sdg)
        for i, b in enumerate(sdg): m[start + i] = b
    if ddb is not None:
        top = 0x10000 - 2089 if sdg is None else 0x10000 - len(sdg)
        if 0x8400 + len(ddb) > top:
            raise SystemExit('DDB demasiado grande: %d bytes' % len(ddb))
        for a in range(0x8400, top): m[a] = 0
        for i, b in enumerate(ddb): m[0x8400 + i] = b
    out = []
    pending = list(commands)
    typing = None            # orden que se está tecleando
    ops = sim.opcodes
    FD = 70908 if machine == '128' else 69888
    frames = 0
    idle_waits = 0
    via_hook = False
    while frames < max_frames:
        end = (r[25] // FD + 1) * FD
        while r[25] < end:
            pc = r[24]
            if watch and pc in watch: log.append((watch[pc], len(out), m[r[12]] | m[r[12] + 1] << 8, bytes(m[a] for a in watch.get('mem', range(0)))))
            # 0x751C/0x751D: el último carácter de un token entra por 0x751D,
            # los demás pasan por 0x751C y caen en 0x751D; contamos uno solo.
            if pc == PRINT_HOOK:
                out.append(daad_char(r[0]))     # r[0] = A
                via_hook = True
            elif pc == PRINT_HOOK + 1:
                if not via_hook: out.append(daad_char(r[0]))
                via_hook = False
            elif pc in WAITS and not (m[23611] & 0x20):
                sp = r[12]
                ret = m[sp + 2] | m[sp + 3] << 8
                if ret in INPUTS:
                    if typing is None:
                        if not pending:
                            if png: shot(m, png)
                            if screen is not None: screen.extend(m[a] for a in range(0x4000, 0x5B00))
                            return ''.join(out)
                        typing = list(pending.pop(0)) + ['\r']
                        out.append('«' + ''.join(typing[:-1]) + '»')
                    ch = typing.pop(0)
                    code = 13 if ch == '\r' else unicode_key(ch)
                    if not typing: typing = None
                else:
                    code = 32
                    out.append('{key}')
                    if keyshots is not None:
                        keyshots.append(bytes(m[a] for a in range(0x4000, 0x5B00)))
                    idle_waits += 1
                    if idle_waits > 500:
                        return ''.join(out) + '\n{bucle de teclas}'
                m[23560] = code               # LAST_K
                m[23611] |= 0x20              # FLAGS: tecla nueva
            ops[m[pc]]()
        if r[26]: sim.accept_interrupt(r, m, r[24])
        frames += 1
    return ''.join(out) + '\n{timeout}'

def norm(s):
    """Para comparar transcripciones: sin "Hay más..."/"More..." (depende de la
    geometría) y con las peticiones de orden al azar del inglés unificadas."""
    import re
    s = re.sub(r'(Hay más|More)\.\.\.\{key\}', '', s)
    return re.sub(r'What (now|next|should I do now|should I do next)\?', '{prompt}', s)

def shot(m, path):
    sys.path.insert(0, os.path.join(HERE))
    from scr2png import png
    png(m, path)

if __name__ == '__main__':
    ddb = open(sys.argv[1], 'rb').read()
    cmds = [l.rstrip('\n') for l in open(sys.argv[2], encoding='utf8')] if len(sys.argv) > 2 else []
    cmds = [c for c in cmds if c and not c.startswith('#')]
    png = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None
    print(run(ddb, cmds, png=png))
