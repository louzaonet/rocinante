import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad
bad = 0
for f in sorted(os.listdir(os.path.join(HERE, 'rt'))):
    n = f[:-4]
    cmds = open(os.path.join(HERE, 'cases', n + '.cmd'), encoding='utf8').read().split('\n')[:-1]
    got = zxdaad.run(open(os.path.join(HERE, 'rt', f), 'rb').read(), cmds)
    want = open(os.path.join(HERE, 'ref', n + '.txt'), encoding='utf8').read()
    norm = zxdaad.norm
    if norm(got) == norm(want): print('ok  ', n)
    else:
        bad += 1
        i = next(i for i in range(min(len(got), len(want))) if got[i] != want[i]) if norm(got) != norm(want) else 0
        print('FAIL', n, i); print(want[max(0,i-100):i+100]); print('---'); print(got[max(0,i-100):i+100])
sys.exit(1 if bad else 0)
