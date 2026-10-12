"""Pantallas con dibujos vectoriales (y un mapa de bits) en los intérpretes
reales, comparadas con las del motor JS (test/vector.mjs)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
bad = 0
for n in ('', '_en'):
    for tag in 'abcdefgh':
        cmds = open(os.path.join(HERE, 'vec', 'cmds%s%s.txt' % (tag, n))).read().split('\n')[:-1]
        js = open(os.path.join(HERE, 'vec', 'js%s%s.bin' % (tag, n)), 'rb').read()
        for m in ('48', '128'):
            fin = []
            zxdaad.run(None, cmds, snap=os.path.join(HERE, 'vec', 'v%s%s.z80' % (m, n)), screen=fin, png='/tmp/vec%s%s%s.png' % (m, tag, n))
            diff = sum(1 for a, b in zip(js, fin) if a != b)
            print('ok  ' if not diff else 'FAIL', 'v%s%s %s' % (m, n, tag), '' if not diff else '(%d bytes distintos)' % diff)
            bad += diff > 0
            if diff: open('/tmp/vec_zx%s%s%s.bin' % (m, tag, n), 'wb').write(bytes(fin))
sys.exit(1 if bad else 0)
