import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
norm = zxdaad.norm
bad = 0
for n in ('', '_en'):
    cmds = open(os.path.join(HERE, 'tpl', 'cmds%s.txt' % n), encoding='utf8').read().split('\n')[:-1]
    want = open(os.path.join(HERE, 'tpl', 'js%s.txt' % n), encoding='utf8').read()
    for m in ('48', '128'):
        got = zxdaad.run(None, cmds, snap=os.path.join(HERE, 'tpl', 't%s%s.z80' % (m, n)), png='/tmp/tpl%s%s.png' % (m, n))
        if norm(got) == norm(want): print('ok  ', m + n)
        else:
            bad += 1
            i = next((i for i in range(min(len(got), len(want))) if norm(got)[i] != norm(want)[i]), 0)
            print('FAIL', m + n); print(norm(want)[max(0,i-200):i+200]); print('----'); print(norm(got)[max(0,i-200):i+200])
sys.exit(bad)
