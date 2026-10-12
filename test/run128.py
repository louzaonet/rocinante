"""Ejecuta los casos exportados a 128K (test/x128) en el intérprete original
sobre un Spectrum 128K y compara con las referencias."""
import os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
bad = 0
names = sys.argv[1:] or sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(HERE, 'x128', '*.ddb')))
for n in names:
    ddb = open(os.path.join(HERE, 'x128', n + '.ddb'), 'rb').read()
    banks = {}
    for f in glob.glob(os.path.join(HERE, 'x128', n + '.bank*')):
        banks[int(f.rsplit('bank', 1)[1])] = open(f, 'rb').read()
    cmds = open(os.path.join(HERE, 'cases', n + '.cmd'), encoding='utf8').read().split('\n')[:-1]
    got = zxdaad.run(ddb, cmds, machine='128', banks=banks)
    want = open(os.path.join(HERE, 'ref', n + '.txt'), encoding='utf8').read()
    norm = zxdaad.norm
    if norm(got) == norm(want): print('ok  ', n)
    else:
        bad += 1
        g, w = norm(got), norm(want)
        i = next((i for i in range(min(len(g), len(w))) if g[i] != w[i]), min(len(g), len(w)))
        print('FAIL', n, i); print(w[max(0, i-150):i+150]); print('---'); print(g[max(0, i-150):i+150])
sys.exit(1 if bad else 0)
