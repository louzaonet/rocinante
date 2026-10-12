"""Atari ST: los discos de test/st/ (de test/m68k.mjs) en Hatari, con EmuTOS y
el intérprete DAAD original, que arranca solo desde el disco.

- La plantilla, en castellano y en inglés: se juega con las mismas órdenes que
  el motor JS y se lee el texto de la pantalla. Las palabras tienen que ser las
  mismas (el ST parte las líneas a 53 columnas y el Spectrum a 42).
- El dibujo de la primera localidad: cada punto se compara con el color que
  tiene en PART1.DAT, y el texto de la localidad tiene que leerse debajo (el
  dibujo no puede cambiar los colores del texto)."""
import base64, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
try:
    import strun
except ImportError:
    print('Falta Pillow (pip install pillow); se salta la prueba del Atari ST.')
    sys.exit(0)

if not strun.available():
    print('Faltan Hatari, Xvfb o EmuTOS (tools/setup-atari.sh); se salta la prueba del Atari ST.')
    sys.exit(0)
D = os.path.join(HERE, 'st')
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
        lines = [l[:-1] if l.endswith('>_') else l for l in lines]      # el cursor
        while lines and not lines[-1]:
            lines.pop()
        if lines and lines[-1] == '>':
            lines.pop()
        lines = [l for l in lines if l]
        if out and out[-1].endswith('>'):
            out.pop()
        k = min(len(out), len(lines))
        while k and out[-k:] != lines[:k]:
            k -= 1
        out += lines[k:]
    return out

for n in ('', '_en'):
    cmds = open(os.path.join(D, 'cmds%s.txt' % n)).read().split('\n')[:-1]
    steps = [('snap',), ('type', ' '), ('wait', 1), ('snap',)]
    for c in cmds:
        steps += [('type', c + '\n'), ('wait', 1), ('snap',)]
    shots = strun.run(os.path.join(D, 'plantilla%s.st' % n), steps)
    got = words(' '.join(merge([strun.text(im, cs) for im in shots])))
    want = words(open(os.path.join(D, 'js%s.txt' % n)).read())
    want = [w for w in ' '.join(want).replace('> ', '>').split()]
    if want and want[-1] == '>':
        want.pop()
    same = got == want
    if not same:
        i = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
        print('   ST: ', ' '.join(got[max(0, i - 8):i + 8]))
        print('   JS: ', ' '.join(want[max(0, i - 8):i + 8]))
    print('ok  ' if same else 'FAIL', 'plantilla%s: %d palabras' % (n, len(want)))
    bad += not same

    # el dibujo de la localidad 1: a cada índice de color le toca el RGB que
    # más veces aparece donde se espera ese índice
    exp = json.load(open(os.path.join(D, 'dibujo%s.json' % n)))
    want_c = base64.b64decode(exp['pixels'])
    W, H, X, Y = exp['width'], exp['height'], exp['x'], exp['y']
    im = strun.run(os.path.join(D, 'dibujos%s.st' % n), [('type', ' '), ('wait', 4), ('snap',)])[0]
    below = words(' '.join(strun.text(im, cs)[(Y + H) // 8:]))
    first = words(open(os.path.join(D, 'js%s.txt' % n)).read().split('{key}')[1])[:5]
    print('ok  ' if below[:5] == first else 'FAIL', 'dibujo%s: texto debajo del dibujo (%s)' % (n, ' '.join(below[:5])))
    bad += below[:5] != first
    votes = {}
    for y in range(H):
        for x in range(W):
            v = votes.setdefault(want_c[y * W + x], {})
            c = strun.pixel(im, X + x, Y + y)
            v[c] = v.get(c, 0) + 1
    rgb = {k: max(v, key=v.get) for k, v in votes.items()}
    hit = sum(1 for y in range(H) for x in range(W) if strun.pixel(im, X + x, Y + y) == rgb[want_c[y * W + x]])
    ratio = hit / (W * H)
    big = [rgb[k] for k, v in votes.items() if sum(v.values()) >= 100]
    distinct = len(set(big)) == len(big)
    print('ok  ' if ratio > 0.99 and distinct else 'FAIL', 'dibujo%s: %.1f %% de los puntos con su color' % (n, 100 * ratio))
    bad += not (ratio > 0.99 and distinct)
sys.exit(1 if bad else 0)
