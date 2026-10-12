"""Carga en el emulador las cintas de test/tap (como en un Spectrum real, con
el cargador BASIC y el de código máquina) y comprueba que el juego se comporta
igual que con el motor JS: la plantilla por su transcripción (test/tpl) y el
caso de dibujos por la pantalla final (test/pic). Lo mismo con los .tzx y con
dos .wav, que se cargan como audio por la rutina de la ROM."""
import os, sys, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import zxdaad, wavread, tempfile as _t

def load(tap, machine, audio=False):
    """tap2sna de skoolkit: arranca la ROM, carga la cinta y para en 6000h.
    Con audio=True, sin atajos: la ROM lee los flancos uno a uno."""
    z80 = os.path.join(tempfile.mkdtemp(), 'cinta.z80')
    opts = ['-c', 'machine=128'] if machine == '128' else []
    if audio: opts += ['-c', 'fast-load=0', '-c', 'accelerator=none']
    subprocess.run(['tap2sna.py', *opts, '--start', '0x6000', tap, z80], check=True, stdout=subprocess.DEVNULL)
    return z80

bad = 0
for ext in ('tap', 'tzx'):
  for n in ('', '_en'):
      cmds = open(os.path.join(HERE, 'tpl', 'cmds%s.txt' % n), encoding='utf8').read().split('\n')[:-1]
      want = open(os.path.join(HERE, 'tpl', 'js%s.txt' % n), encoding='utf8').read()
      for m in ('48', '128'):
          got = zxdaad.run(None, cmds, snap=load(os.path.join(HERE, 'tap', 't%s%s.%s' % (m, n, ext)), m))
          ok = zxdaad.norm(got) == zxdaad.norm(want)
          bad += not ok
          print('ok  ' if ok else 'FAIL', 't%s%s.%s' % (m, n, ext))
      cmds = open(os.path.join(HERE, 'pic', 'cmds%s.txt' % n)).read().split('\n')[:-1]
      js = open(os.path.join(HERE, 'pic', 'js%s.bin' % n), 'rb').read()
      for m in ('128', '48'):
          fin = []
          zxdaad.run(None, cmds, snap=load(os.path.join(HERE, 'tap', 'p%s%s.%s' % (m, n, ext)), m), screen=fin)
          diff = sum(1 for a, b in zip(js, fin) if a != b)
          bad += diff > 0
          print('ok  ' if not diff else 'FAIL', 'p%s%s.%s' % (m, n, ext), '' if not diff else '(%d bytes distintos)' % diff)
# audio: los bloques que se leen del .wav son los del .tap, y el juego carga
wavdir = os.path.join(_t.gettempdir(), 'rocinante-wav')
def tap_blocks(path):
    t, out, i = open(path, 'rb').read(), [], 0
    while i < len(t): l = t[i] | t[i + 1] << 8; out.append(t[i + 2:i + 2 + l]); i += 2 + l
    return out
for name, m, check in (('t48', '48', 'tpl'), ('p128_en', '128', 'pic')):
    wav = os.path.join(wavdir, name + '.wav')
    same = wavread.blocks(wavread.pulses(wav)) == tap_blocks(os.path.join(HERE, 'tap', name + '.tap'))
    tzx = os.path.join(tempfile.mkdtemp(), 'audio.tzx')
    wavread.to_tzx(wav, tzx)
    snap = load(tzx, m, audio=True)
    if check == 'tpl':
        cmds = open(os.path.join(HERE, 'tpl', 'cmds.txt'), encoding='utf8').read().split('\n')[:-1]
        ok = zxdaad.norm(zxdaad.run(None, cmds, snap=snap)) == zxdaad.norm(open(os.path.join(HERE, 'tpl', 'js.txt'), encoding='utf8').read())
    else:
        cmds = open(os.path.join(HERE, 'pic', 'cmds_en.txt')).read().split('\n')[:-1]
        fin = []
        zxdaad.run(None, cmds, snap=snap, screen=fin)
        ok = bytes(fin) == open(os.path.join(HERE, 'pic', 'js_en.bin'), 'rb').read()
    bad += not (same and ok)
    print('ok  ' if same and ok else 'FAIL', name + '.wav', '' if same else '(bloques distintos)', '' if ok else '(no carga bien)')
sys.exit(1 if bad else 0)
