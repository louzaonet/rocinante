"""MSX: los cartuchos de test/msx/ (de test/msx.mjs) en openMSX, con C-BIOS y
el intérprete DAAD original.

- La plantilla, en castellano y en inglés: se juega con las mismas órdenes que
  el motor JS y se lee el texto de la pantalla. Las palabras tienen que ser las
  mismas.
- El dibujo de la primera localidad: cada punto se compara con el color que
  tiene en el Spectrum (a cada color del Spectrum le toca el del MSX que más
  veces sale donde se espera ese color), y el texto de la localidad tiene que
  leerse debajo. El MSX escribe despacio: tras cada orden se espera más que en
  otras máquinas."""
import base64, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
try:
    import msxrun
except ImportError:
    print('Falta Pillow (pip install pillow); se salta la prueba del MSX.')
    sys.exit(0)

if not msxrun.available():
    print('Faltan openMSX, C-BIOS o Xvfb (apt install openmsx cbios xvfb); se salta la prueba del MSX.')
    sys.exit(0)
D = os.path.join(HERE, 'msx')
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
    steps = [('ready',), ('snap',), ('type', ' '), ('wait', 1.5), ('snap',)]
    for c in cmds:
        steps += [('type', c + '\n'), ('wait', 2.5), ('snap',)]
    shots = msxrun.run(os.path.join(D, 'plantilla%s.rom' % n), steps)
    got = words(' '.join(merge([msxrun.text(im, cs) for im in shots])))
    want = words(open(os.path.join(D, 'js%s.txt' % n)).read())
    want = [w for w in ' '.join(want).replace('> ', '>').split()]
    if want and want[-1] == '>':
        want.pop()
    same = got == want
    if not same:
        i = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
        print('   MSX:', ' '.join(got[max(0, i - 8):i + 8]))
        print('   JS: ', ' '.join(want[max(0, i - 8):i + 8]))
    print('ok  ' if same else 'FAIL', 'plantilla%s: %d palabras' % (n, len(want)))
    bad += not same

    exp = json.load(open(os.path.join(D, 'dibujo%s.json' % n)))
    want_c = base64.b64decode(exp['colours'])
    H = 8 * exp['rows']
    im = msxrun.run(os.path.join(D, 'dibujos%s.rom' % n), [('ready',), ('type', ' '), ('wait', 4), ('snap',)])[0]
    below = words(' '.join(msxrun.text(im, cs)[exp['rows']:]))
    first = words(open(os.path.join(D, 'js%s.txt' % n)).read().split('{key}')[1])[:5]
    print('ok  ' if below[:5] == first else 'FAIL', 'dibujo%s: texto debajo del dibujo (%s)' % (n, ' '.join(below[:5])))
    bad += below[:5] != first
    votes = {}
    for y in range(H):
        for x in range(256):
            v = votes.setdefault(want_c[y * 256 + x], {})
            c = msxrun.pixel(im, x, y)
            v[c] = v.get(c, 0) + 1
    rgb = {k: max(v, key=v.get) for k, v in votes.items()}
    hit = sum(1 for y in range(H) for x in range(256) if msxrun.pixel(im, x, y) == rgb[want_c[y * 256 + x]])
    ratio = hit / (256 * H)
    # los colores que más se ven tienen que salir distintos; el mismo color con
    # y sin brillo puede salir igual (en el Spectrum, BRIGHT cambia también el
    # papel que ya estaba en el cuadro, y eso el MSX no lo hace)
    hues = {}
    for k, v in votes.items():
        if sum(v.values()) >= 100:
            hues.setdefault(k & 7, set()).add(rgb[k])
    seen = [c for v in hues.values() for c in v]
    distinct = len(seen) == len(set(seen))
    print('ok  ' if ratio > 0.95 and distinct else 'FAIL', 'dibujo%s: %.1f %% de los puntos con su color' % (n, 100 * ratio))
    bad += not (ratio > 0.95 and distinct)
sys.exit(1 if bad else 0)
