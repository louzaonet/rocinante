"""Genera src/spectrum/daadbase.js: el estado de la máquina justo antes de
arrancar el intérprete DAAD (PC=6000h), en 48K y 128K, sacado del emulador.
Incluye los intérpretes DS48IS (español) y DS48IE (inglés), de dominio público.
No incluye ninguna ROM.

Las bases ref/base_<idioma>48.z80 y ref/base_<idioma>128.pkl salen de cargar en
el emulador la cinta que hace daadmaker (de DRC: tools/setup-drc.sh lo deja en
.drc/) con el intérprete y PART1.SDG:
    tap2sna.py --start 0x6000 juego.tap base_es48.z80
    tap2sna.py -c machine=128 --start 0x6000 juego.tap base_es128.z80
(la de 128K se guarda con los bancos en un .pkl)."""
import base64, json, os, pickle, sys
from skoolkit.snapshot import Snapshot
from skoolkit.simutils import from_snapshot
from skoolkit.simulator import Simulator
HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, '..', 'ref')
b64 = lambda b: base64.b64encode(bytes(b)).decode()
NAMES = 'a f b c d e h l ixh ixl iyh iyl sp _x i r a_ f_ b_ c_ d_ e_ h_ l_ pc t iff im'.split()

def regs(r):
    d = dict(zip(NAMES, r))
    return {'a': d['a'], 'f': d['f'], 'bc': d['b'] * 256 + d['c'], 'de': d['d'] * 256 + d['e'],
            'hl': d['h'] * 256 + d['l'], 'a_': d['a_'], 'f_': d['f_'], 'bc_': d['b_'] * 256 + d['c_'],
            'de_': d['d_'] * 256 + d['e_'], 'hl_': d['h_'] * 256 + d['l_'],
            'ix': d['ixh'] * 256 + d['ixl'], 'iy': d['iyh'] * 256 + d['iyl'], 'sp': d['sp'],
            'pc': d['pc'], 'i': d['i'], 'r': d['r'], 'iff': d['iff'], 'im': d['im']}

def bases(lang):
    sim = from_snapshot(Simulator, Snapshot.get(os.path.join(REF, 'base_%s48.z80' % lang)))
    m = sim.memory
    assert sim.registers[24] == 0x6000
    ram = bytearray(m[0x5800:0x8400]); ram[0:768] = bytes([7]) * 768      # atributos: blanco sobre negro
    base48 = {'from': 0x5800, 'data': b64(ram), 'regs': regs(sim.registers)}
    st = pickle.load(open(os.path.join(REF, 'base_%s128.pkl' % lang), 'rb'))
    b7 = st['banks'][7]
    nz = [i for i, v in enumerate(b7) if v]
    b5 = bytearray(st['banks'][5][0x1800:0x4000]); b5[0:768] = bytes([7]) * 768
    base128 = {'bank5': b64(b5), 'bank2': b64(st['banks'][2][0:0x400]),
               'bank7from': nz[0], 'bank7': b64(b7[nz[0]:nz[-1] + 1]), 'out7ffd': st['o7ffd'],
               'regs': regs(st['regs'])}
    return {'b48': base48, 'b128': base128}
BASES = {lang: bases(lang) for lang in ('es', 'en')}
# Juego de caracteres por defecto: el de PART1.SDG de DAAD (dominio público)
sdg = open(sys.argv[1], 'rb').read()[128:]
mem = bytearray(65536); start = 0x10000 - 2089
mem[start:] = sdg[:2089]
cs = mem[0xFFF7] | mem[0xFFF8] << 8
charset = b64(mem[cs:cs + 2048])
out = os.path.join(HERE, '..', 'src', 'spectrum', 'daadbase.js')
open(out, 'w').write(
    '// Generado por tools/mkbase.py. Estado inicial de la máquina con el intérprete\n'
    '// DAAD cargado (DS48IS en español, DS48IE en inglés; dominio público), a punto\n'
    '// de ejecutar 6000h. El juego de caracteres es el de PART1.SDG de DAAD.\n'
    'export const BASES = ' + json.dumps(BASES) + ';\n'
    "export { DAAD_CHARSET } from './charset-default.js';\n")
open(os.path.join(HERE, '..', 'src', 'spectrum', 'charset-default.js'), 'w').write(
    '// Juego de caracteres de PART1.SDG (distribución de DAAD, dominio público).\n'
    'export const DAAD_CHARSET = "' + charset + '";\n')
print('ok', os.path.getsize(out))
