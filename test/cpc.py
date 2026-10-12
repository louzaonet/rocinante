"""Amstrad CPC: los discos de test/cpc/ (de test/cpc.mjs) en MAME con el
intérprete DAAD original.

- La plantilla, en castellano y en inglés: se juega con las mismas órdenes que
  el motor JS y se lee el texto de la pantalla. Las palabras tienen que ser las
  mismas (el CPC parte las líneas a 40 columnas y el Spectrum a 42).
- El dibujo de la primera localidad: cada punto de la ventana se compara con
  el color que debería tener.
- La cinta (.cdt y su audio .wav) en un 464: carga y empieza la partida."""
import base64, json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
try:
    import cpcrun
except ImportError:
    print('Falta Pillow (pip install pillow); se salta la prueba del CPC.')
    sys.exit(0)

if not cpcrun.available():
    print('Faltan MAME o las ROM del CPC (tools/setup-cpc.sh); se salta la prueba del CPC.')
    sys.exit(0)
D = os.path.join(HERE, 'cpc')
cs = open(os.path.join(D, 'charset.bin'), 'rb').read()
bad = 0

def words(s):
    s = re.sub(r'\{[^}]*\}', ' ', s).replace('«', '').replace('»', '')
    return s.split()

def merge(screens):
    """Une las pantallas sucesivas de la ventana de texto en una sola lista de líneas"""
    out = []
    for lines in screens:
        lines = [l.replace('\0', '').rstrip() for l in lines]
        while lines and not lines[-1]:
            lines.pop()
        if lines and lines[-1] == '>':          # la entrada vacía, aún sin escribir
            lines.pop()
        lines = [l for l in lines if l]
        # una línea que acaba en «>» espera una respuesta: en la pantalla
        # siguiente sale ya con ella
        if out and out[-1].endswith('>'):
            out.pop()
        k = min(len(out), len(lines))
        while k and out[-k:] != lines[:k]:
            k -= 1
        out += lines[k:]
    return out

for n in ('', '_en'):
    cmds = open(os.path.join(D, 'cmds%s.txt' % n)).read().split('\n')[:-1]
    steps = [('wait', 1200), ('snap',), ('type', ' '), ('wait', 300), ('snap',)]
    for c in cmds:
        steps += [('type', c + '\n'), ('wait', 500), ('snap',)]
    shots = cpcrun.run(os.path.join(D, 'plantilla%s.dsk' % n), steps)
    got = words(' '.join(merge([cpcrun.text(im, cs) for im in shots])))
    want = words(open(os.path.join(D, 'js%s.txt' % n)).read())
    # el «>» del CPC va pegado a la orden
    want = [w for w in ' '.join(want).replace('> ', '>').split()]
    if want and want[-1] == '>':
        want.pop()
    same = got == want
    if not same:
        i = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
        print('   CPC:', ' '.join(got[max(0, i - 8):i + 8]))
        print('   JS: ', ' '.join(want[max(0, i - 8):i + 8]))
    print('ok  ' if same else 'FAIL', 'plantilla%s: %d palabras' % (n, len(want)))
    bad += not same

    # el dibujo de la localidad 1
    exp = json.load(open(os.path.join(D, 'dibujo%s.json' % n)))
    pens = base64.b64decode(exp['pens'])
    rgb = [tuple(v * 255 // 2 for v in (k // 3 % 3, k // 9, k % 3)) for k in exp['inks']]
    im = cpcrun.run(os.path.join(D, 'dibujos%s.dsk' % n), [('wait', 900), ('type', ' '), ('wait', 1800), ('snap',)])[0]
    w = exp['window']
    total = hit = 0
    for y in range(176):
        row = (175 - y) >> 3
        if not w['r0'] <= row < w['r1']:
            continue
        for x in range(8 * w['c0'], 8 * w['c1']):
            c = cpcrun.pixel(im, x + 32, 175 - y)
            got_pen = min(range(4), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, rgb[i])))
            total += 1
            hit += got_pen == pens[x | (y << 8)]
    ratio = hit / total if total else 0
    print('ok  ' if ratio > 0.9 else 'FAIL', 'dibujo%s: %.1f %% de los puntos con su color' % (n, 100 * ratio))
    bad += ratio <= 0.9
# la cinta, en un CPC 464
if cpcrun.available464():
    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, 'plantilla.wav')
    subprocess.run(['node', '--input-type=module', '-e',
                    "import fs from 'fs'; import { cdtToWav } from './src/cpc/cpctape.js';"
                    "fs.writeFileSync(process.argv[1], cdtToWav(new Uint8Array(fs.readFileSync(process.argv[2]))))",
                    wav, os.path.join(D, 'plantilla.cdt')], cwd=os.path.join(HERE, '..'), check=True)
    for img in (os.path.join(D, 'plantilla.cdt'), wav):
        shots = cpcrun.run(img, [('wait', 8500), ('type', ' '), ('wait', 300), ('type', 'mirar\n'), ('wait', 300), ('snap',)])
        lines = [l.strip() for l in cpcrun.text(shots[0], cs)] if shots else []
        good = '>mirar' in lines
        print('ok  ' if good else 'FAIL', 'cinta %s en el 464' % os.path.splitext(img)[1])
        bad += not good
else:
    print('Faltan las ROM del 464 (tools/setup-cpc.sh); se salta la prueba de la cinta.')
sys.exit(1 if bad else 0)
