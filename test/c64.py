"""Commodore 64: los discos de test/c64/ (de test/c64.mjs) en VICE con el
intérprete DAAD original y su cargador.

- La plantilla, en castellano y en inglés: se juega con las mismas órdenes que
  el motor JS y se lee el texto de la pantalla. Las palabras tienen que ser las
  mismas (el C64 parte las líneas a 40 columnas y el Spectrum a 42).
- El dibujo de la primera localidad: cada punto de la ventana se compara con
  el color que tiene en el Spectrum, pasado a los colores del C64."""
import base64, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
try:
    import c64run
except ImportError:
    print('Falta Pillow (pip install pillow); se salta la prueba del C64.')
    sys.exit(0)

if not c64run.available():
    print('Faltan VICE, Xvfb o las ROM del C64 (tools/setup-c64.sh); se salta la prueba del C64.')
    sys.exit(0)
D = os.path.join(HERE, 'c64')
cs = open(os.path.join(D, 'charset.bin'), 'rb').read()
bad = 0

def words(s):
    # en la fuente del C64 la l y el 1 son el mismo dibujo: se comparan igual
    s = re.sub(r'\{[^}]*\}', ' ', s).replace('«', '').replace('»', '').replace('1', 'l')
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
        steps += [('type', c + '\n'), ('wait', 0.8), ('snap',)]
    shots = c64run.run(os.path.join(D, 'plantilla%s.d64' % n), steps)
    got = words(' '.join(merge([c64run.text(im, cs) for im in shots])))
    want = words(open(os.path.join(D, 'js%s.txt' % n)).read())
    want = [w for w in ' '.join(want).replace('> ', '>').split()]
    if want and want[-1] == '>':
        want.pop()
    same = got == want
    if not same:
        i = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
        print('   C64:', ' '.join(got[max(0, i - 8):i + 8]))
        print('   JS: ', ' '.join(want[max(0, i - 8):i + 8]))
    print('ok  ' if same else 'FAIL', 'plantilla%s: %d palabras' % (n, len(want)))
    bad += not same

    # el dibujo de la localidad 1: el color de cada punto. La paleta de VICE
    # no es la de Rocinante, así que a cada color del C64 le toca el RGB que más
    # veces aparece donde se espera ese color
    exp = json.load(open(os.path.join(D, 'dibujo%s.json' % n)))
    want_c = base64.b64decode(exp['colours'])
    im = c64run.run(os.path.join(D, 'dibujos%s.d64' % n), [('type', ' '), ('wait', 4), ('snap',)])[0]
    pts = [(x, y) for y in range(176) if (175 - y) >> 3 < exp['rows'] for x in range(256)]
    votes = {}
    for x, y in pts:
        votes.setdefault(want_c[x | (y << 8)], {}).setdefault(c64run.pixel(im, x + 32, 175 - y), 0)
        votes[want_c[x | (y << 8)]][c64run.pixel(im, x + 32, 175 - y)] += 1
    rgb = {k: max(v, key=v.get) for k, v in votes.items()}
    hit = sum(1 for x, y in pts if c64run.pixel(im, x + 32, 175 - y) == rgb[want_c[x | (y << 8)]])
    ratio = hit / len(pts)
    # los colores que más se ven tienen que salir distintos
    big = [rgb[k] for k, v in votes.items() if sum(v.values()) >= 100]
    distinct = len(set(big)) == len(big)
    print('ok  ' if ratio > 0.95 and distinct else 'FAIL', 'dibujo%s: %.1f %% de los puntos con su color' % (n, 100 * ratio))
    bad += not (ratio > 0.95 and distinct)
sys.exit(1 if bad else 0)
