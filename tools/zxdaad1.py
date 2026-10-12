"""Juega una aventura de la primera versión de DAAD (Spectrum 48K) en su propio
intérprete, emulado con skoolkit, y devuelve lo que imprime y la pantalla en
cada espera de orden. Sirve para comparar un juego clásico con lo que sale al
importarlo en Rocinante y exportarlo (test/classic.py).

    run(mem, ordenes) -> (texto, pantallas)
    mem: los 64K de la memoria tras la carga (el bloque de código va de 6204h
    al final); ordenes: lista de órdenes

Como zxdaad.py, parte de ref/base_es48.z80 (la ROM ya inicializada), pone el
bloque de código, deja la pila como el CLEAR del cargador BASIC y salta al
principio del bloque. Las direcciones son las del intérprete "TGDAADV1.0" de
La Aventura Original (1989); con otro, available(mem) da False.

Si el juego tiene la versión 2 de DAAD (el intérprete de siempre en 6000h y
la base de datos en 8400h), run2(mem, ordenes) hace lo mismo con él.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zxdaad
from skoolkit.snapshot import Snapshot
from skoolkit.simutils import from_snapshot
from skoolkit.simulator import Simulator

START = 0x6204
# lo que hay en cada dirección que se usa (para no equivocarse de intérprete)
SIGN = {0x774B: b'\xd5\xc5', 0x761B: b'\xd5\xfd\xcb\x01\x6e', 0x7627: b'\xd5\xdd\x56\x30'}
V1 = dict(print=0x774B, waits=(0x761B, 0x7627, 0x7624), inputs=(0x73D0, 0x73E6), retoff=0)
V2 = dict(print=0x751D, waits=(0x73D6, 0x73FA), inputs=(0x71A1, 0x718B), retoff=2)

def available(mem):
    return mem[0x6CE5:0x6CEF] == b'TGDAADV1.0' and all(mem[a:a + len(b)] == b for a, b in SIGN.items())

def clear(m, r, ramtop):
    """Como CLEAR ramtop en BASIC: la pila del sistema justo debajo"""
    m[23730] = ramtop & 255; m[23731] = ramtop >> 8
    m[ramtop] = 0x3E; m[ramtop - 1] = 0x00
    m[ramtop - 2] = 0x13; m[ramtop - 3] = 0x03
    sp = ramtop - 3
    m[23613] = sp & 255; m[23614] = sp >> 8
    r[12] = sp

def _run(mem, start, entry, commands, hooks, ramtop, max_frames, final=None, patches=()):
    sim = from_snapshot(Simulator, Snapshot.get(os.path.join(HERE, '..', 'ref', 'base_es48.z80')))
    sim.set_tracer(zxdaad.Ports(sim))
    m = sim.memory; r = sim.registers
    for a in range(start, 0x10000): m[a] = mem[a]
    for a, data in patches:
        for i, b in enumerate(data): m[a + i] = b
    if ramtop: clear(m, r, ramtop)
    r[24] = entry
    out, screens = [], []
    pending = list(commands); typing = None
    ops = sim.opcodes; FD = 69888; frames = 0; idle = 0
    PH, WAITS, INPUTS, RO = hooks['print'], hooks['waits'], hooks['inputs'], hooks['retoff']
    screen = lambda: bytes(m[a] for a in range(0x4000, 0x5B00))
    while frames < max_frames:
        end = (r[25] // FD + 1) * FD
        while r[25] < end:
            pc = r[24]
            if pc == 0:                     # el juego acabó (END y "no"): la máquina se reinicia
                screens.append(screen())
                return ''.join(out) + '\n{fin}', screens
            if pc == PH:
                out.append(zxdaad.daad_char(r[0]))
            elif pc in WAITS and not (m[23611] & 0x20):
                sp = r[12] + RO
                if (m[sp] | m[sp + 1] << 8) in INPUTS:
                    if typing is None:
                        screens.append(screen())
                        if not pending:
                            if final is not None: final.append(bytes(m[a] for a in range(0x10000)))
                            return ''.join(out), screens
                        typing = list(pending.pop(0)) + ['\r']
                        out.append('«' + ''.join(typing[:-1]) + '»')
                    ch = typing.pop(0)
                    code = 13 if ch == '\r' else zxdaad.unicode_key(ch)
                    if not typing: typing = None
                else:
                    code = 32; out.append('{key}'); idle += 1
                    if idle > 2000: return ''.join(out) + '\n{bucle de teclas}', screens
                m[23560] = code; m[23611] |= 0x20
            ops[m[pc]]()
        if r[26]: sim.accept_interrupt(r, m, r[24])
        frames += 1
    return ''.join(out) + '\n{timeout}', screens

# En las listas de objetos seguidas, DAAD 1 cambia "Un"/"Una" por "el"/"la" (la
# rutina 71FEh, la misma que la de "_"); DAAD 2 no, y pone la primera letra en
# minúscula. Con same_lists=True la lista salta (6F86h) a una rutina en el
# búfer de la impresora que hace lo de DAAD 2, para poder comparar con él.
LIST_JP = (0x6F86, b'\xc3\xfe\x71', b'\xc3\x00\x5b')
LIST_CODE = bytes([
    0xE5,              # push hl            (como 71FEh: 7245h lo saca al acabar)
    0xCD, 0x5D, 0x72,  # call 725Dh         hl = texto del objeto
    0xCD, 0x45, 0x72,  # call 7245h         siguiente letra (XOR FFh); Z si es espacio
    0x28, 0xFB,        # jr z               los espacios del principio, fuera
    0xE6, 0xDF,        # and 0DFh           primera letra en minúscula
    0x2F,              # cpl
    0xCD, 0x1D, 0x77,  # call 771Dh         imprime
    0xCD, 0x45, 0x72,  # call 7245h
    0x18, 0xF7,        # jr                 hasta el final del texto
])

def run(mem, commands, max_frames=400000, same_lists=False):
    a, old, new = LIST_JP
    patches = [(a, new), (0x5B00, LIST_CODE)] if same_lists and mem[a:a + 3] == old else []
    return _run(mem, START, START, commands, V1, START - 1, max_frames, patches=patches)

def run2(mem, commands, max_frames=400000, final=None):
    """El intérprete DAAD 2 (DS48IS) con la memoria de 8400h en adelante.
    final: si es una lista, se le añade la memoria al acabar"""
    return _run(mem, 0x8400, 0x6000, commands, V2, None, max_frames, final)
