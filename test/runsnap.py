import os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
bad = 0
for f in sorted(glob.glob(os.path.join(HERE, 'z80', '*.z80'))):
    n = os.path.basename(f).rsplit('_', 1)[0]
    cmds = open(os.path.join(HERE, 'cases', n + '.cmd'), encoding='utf8').read().split('\n')[:-1]
    got = zxdaad.run(None, cmds, snap=f)
    want = open(os.path.join(HERE, 'ref', n + '.txt'), encoding='utf8').read()
    norm = zxdaad.norm
    ok = norm(got) == norm(want)
    bad += not ok
    print('ok  ' if ok else 'FAIL', os.path.basename(f))
    if not ok: print(got[:400])
sys.exit(1 if bad else 0)
