"""Pantallas de referencia: en cada espera de tecla (salvo la línea de
órdenes) y al final, desde el intérprete original. Salida: test/scr/<caso>.bin"""
import os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
os.makedirs(os.path.join(HERE, 'scr'), exist_ok=True)
names = sys.argv[1:] or sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(HERE, 'cases', '*.ddb')))
for n in names:
    cmds = open(os.path.join(HERE, 'cases', n + '.cmd'), encoding='utf8').read().split('\n')[:-1]
    ks, fin = [], []
    zxdaad.run(None, cmds, snap=os.path.join(HERE, 'z80', n + '_48.z80'), keyshots=ks, screen=fin)
    open(os.path.join(HERE, 'scr', n + '.bin'), 'wb').write(b''.join(ks) + bytes(fin))
    print(n, len(ks) + 1)
