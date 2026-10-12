"""Compara los dibujos de un juego de PAW con los que salen al importarlo en
Rocinante: cada dibujo de localidad se pinta con el propio código de PAW en
el emulador y con el de Rocinante (el que usan la versión web y DAAD).
Uso: python3 tools/pawcheck.py juego.z80 [carpeta para las imágenes]
Necesita skoolkit y node. Solo sirve con juegos de 48K."""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zxdaad
from skoolkit.snapshot import Snapshot
from skoolkit.simutils import from_snapshot
from skoolkit.simulator import Simulator

snap = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp()
info = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'pawrender.mjs'), snap, out]))
rows = info['rows']
mm = bytes(16384) + bytes(Snapshot.get(snap).ram())
# las dos rutinas de PAW: preparar la pantalla para el dibujo n y pintarlo
prep = re.search(rb'\x3a\x91\x5c\x32..\xe6\x0f\x32\x91\x5c', mm, re.S)
draw = re.search(rb'\x2a\xf1\xff\xeb\x29\x19', mm)
if not prep or not draw: sys.exit('No encuentro las rutinas de dibujo de PAW en esta instantánea')
STOP = 0x39          # dirección de vuelta que nunca se ejecuta

def paw_picture(n):
    sim = from_snapshot(Simulator, Snapshot.get(snap))
    sim.set_tracer(zxdaad.Ports(sim))
    m, r, ops = sim.memory, sim.registers, sim.opcodes
    def call(addr, de, bc):
        sp = (r[12] - 2) & 0xffff
        m[sp], m[sp + 1] = STOP, 0
        r[12], r[24] = sp, addr
        r[4], r[5], r[2], r[3] = de >> 8, de & 255, bc >> 8, bc & 255
        r[10], r[11] = 0x5C, 0x3A                       # IY
        for _ in range(30_000_000):
            pc = r[24]
            if pc == STOP: return True
            if pc == 0x0008: return False               # error de la ROM: el dibujo se corta
            ops[m[pc]]()
        return False
    ok = call(prep.start(), n, 0x80) and call(draw.start(), n, 0)
    return bytes(m[a] for a in range(0x4000, 0x5B00)), ok

def differs(a, b):
    px = sum(bin(a[i] ^ b[i]).count('1') for y in range(rows * 8)
             for i in [((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2)] for i in range(i, i + 32))
    at = sum((a[i] & 0x7f) != (b[i] & 0x7f) for i in range(6144, 6144 + rows * 32))
    return px, at

print(info['report'])
bad = 0
for n in info['pictures']:
    paw, ok = paw_picture(n)
    open(os.path.join(out, 'paw_%d.scr' % n), 'wb').write(paw)
    daad = open(os.path.join(out, 'daad_%d.scr' % n), 'rb').read()
    px, at = differs(paw, daad)
    note = '' if ok else ' (en PAW se sale de la pantalla)'
    print(('ok  ' if not (px or at) else 'DIF '), 'dibujo', n, '' if not (px or at) else '%d puntos y %d atributos distintos' % (px, at), note)
    bad += bool(px or at)
print('imágenes en', out)
sys.exit(1 if bad else 0)
