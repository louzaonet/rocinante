"""Juegos clásicos importados: cada cinta, instantánea o disco de la carpeta
.clasicos/ (o la de la variable CLASICOS) se importa con tools/classic.mjs,
se exporta a 48K y se juega con las mismas órdenes en el intérprete original
(si es el de la primera versión de DAAD que conoce tools/zxdaad1.py), en el
intérprete DAAD 2 y con el motor JS. Las órdenes son las de juego.txt junto al
juego, si lo hay, o unas al azar con su vocabulario.

- El texto tiene que ser el mismo en los tres, y las pantallas en cada espera
  de orden, iguales en el original y en DAAD 2. Única diferencia conocida: en
  las listas de objetos seguidas, DAAD 1 cambia "un/una" por "el/la" y DAAD 2
  no; para comparar, en el original se quita ese cambio.

Los juegos no van con Rocinante: si la carpeta no está o está vacía, la
prueba se salta."""
import glob, json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
try:
    import zxdaad1
except ImportError:
    print('Falta skoolkit; se salta la prueba de los juegos clásicos.')
    sys.exit(0)
DIR = os.environ.get('CLASICOS', os.path.join(HERE, '..', '.clasicos'))
games = sorted(f for f in glob.glob(os.path.join(DIR, '*')) if re.search(r'\.(tap|tzx|z80|sna|dsk)$', f, re.I))
if not games:
    print('No hay juegos en %s; se salta la prueba de los juegos clásicos.' % DIR)
    sys.exit(0)

def norm(s):
    s = re.sub(r'(Hay más|More)\.\.\.\{key\}', '', s).replace('{key}', '')
    return re.sub(r'\s*\{fin\}$', '', s).rstrip()

def first_diff(a, b):
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]: i += 1
    st = a.rfind('«', 0, i)
    return '   original: %s\n   importado: %s' % (a[max(0, st):i + 80].replace('\n', ' '), b[max(0, st):i + 80].replace('\n', ' '))

bad = 0
for g in games:
    tmp = tempfile.mkdtemp()
    try:
        n = int(subprocess.check_output(['node', os.path.join(HERE, '..', 'tools', 'classic.mjs'), g, tmp]).decode().strip())
    except subprocess.CalledProcessError:
        print('FAIL', os.path.basename(g), ': no se puede importar'); bad += 1; continue
    for k in range(n):
        info = json.load(open(os.path.join(tmp, '%d.json' % k)))
        name = os.path.basename(g) + (' (%s)' % info['label'] if info['label'] else '')
        mem = open(os.path.join(tmp, '%d.mem' % k), 'rb').read()
        ddb = open(os.path.join(tmp, '%d.ddb' % k), 'rb').read(); sdg = open(os.path.join(tmp, '%d.sdg' % k), 'rb').read()
        cmds = open(os.path.join(tmp, '%d.cmds' % k), encoding='utf8').read().split('\n')[:-1]
        js = open(os.path.join(tmp, '%d.js.txt' % k), encoding='utf8').read()
        if info['free'] < 0:
            print('FAIL', name, ': no cabe en 48K'); bad += 1; continue
        exp = bytearray(65536); exp[0x8400:0x8400 + len(ddb)] = ddb; exp[0x10000 - len(sdg):] = sdg
        t2, s2 = zxdaad1.run2(exp, cmds)
        same = norm(t2) == norm(js)
        print('ok  ' if same else 'FAIL', name, ': motor JS igual que DAAD 2 (%d órdenes)' % len(cmds))
        if not same: print(first_diff(norm(t2), norm(js)))
        bad += not same
        if info['version'] != 1 or not zxdaad1.available(mem):
            print('    ', name, ': el original no es de la primera versión de DAAD que conozco; no se compara')
            continue
        t1, s1 = zxdaad1.run(mem, cmds, same_lists=True)
        same = norm(t1) == norm(t2)
        print('ok  ' if same else 'FAIL', name, ': texto igual que el original')
        if not same: print(first_diff(norm(t1), norm(t2)))
        bad += not same
        diff = [i for i, (a, b) in enumerate(zip(s1, s2)) if a != b]
        ok = not diff and len(s1) == len(s2)
        print('ok  ' if ok else 'FAIL', name, ': pantallas iguales que en el original (%d)' % len(s1) + ('' if ok else ', distintas: %s' % diff[:10]))
        bad += not ok
sys.exit(1 if bad else 0)
