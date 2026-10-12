"""Dibujos en mapa de bits: la pantalla final del juego exportado (128K con
bancos y 48K con los dibujos en la memoria principal) en el intérprete real,
comparada con la del motor JS (test/pic/js*.bin)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
bad = 0
for n in ('', '_en'):
    cmds = open(os.path.join(HERE, 'pic', 'cmds%s.txt' % n)).read().split('\n')[:-1]
    js = open(os.path.join(HERE, 'pic', 'js%s.bin' % n), 'rb').read()
    for m in ('128', '48'):
        fin = []
        zxdaad.run(None, cmds, snap=os.path.join(HERE, 'pic', 'p%s%s.z80' % (m, n)), screen=fin, png='/tmp/pic%s%s.png' % (m, n))
        diff = sum(1 for a, b in zip(js, fin) if a != b)
        print('ok  ' if not diff else 'FAIL', 'p%s%s' % (m, n), '' if not diff else '(%d bytes distintos)' % diff)
        bad += diff > 0
sys.exit(1 if bad else 0)
