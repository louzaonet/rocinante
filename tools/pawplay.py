"""Compara un juego de PAW con lo que sale al importarlo en Rocinante: juega
las mismas órdenes en el PAW original (emulado) y en el motor JS, y compara el
texto palabra a palabra.

Uso: python3 tools/pawplay.py juego.z80 [ordenes.txt | semilla]
  Sin órdenes, 150 al azar sacadas del vocabulario (las que hace
  tools/classic.mjs; la semilla cambia cuáles). Necesita skoolkit y node.
  Solo sirve con juegos de 48K.

El texto del original se lee de la pantalla letra a letra con el propio juego
de caracteres del juego: lo nuevo de cada pantalla respecto a la anterior,
contando con que el texto sube. Las teclas van por LAST_K y se pulsan cuando
la pantalla lleva un rato quieta; las órdenes se teclean en mayúsculas (PAW
no pasa a mayúsculas lo que entra por LAST_K) y con el símbolo que el juego
usa para la ñ. Dos palabras que solo se parten de otra manera por el ancho de
línea (32 columnas en PAW, 42 en Rocinante) no cuentan como diferencia. Lo que
el juego borra con CLS antes de esperar al jugador no llega a verse, y sale
como diferencia (en el JS sí está)."""
import sys, os, re, json, subprocess, tempfile, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# sin acentos ni mayúsculas, para comparar lo tecleado con lo que sale en pantalla
plain = lambda s: unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
import zxdaad
from skoolkit.snapshot import Snapshot
from skoolkit.simutils import from_snapshot
from skoolkit.simulator import Simulator

ES_MAP = {'@': 'á', '#': 'é', '$': 'í', '%': 'ó', '&': 'ú', '[': '¡', '\\': 'Ñ', ']': '¿', '^': '«', '`': '»', '{': 'ü', '|': 'ñ', '~': 'ç'}

def run(snap, cmds, shots=None, max_wait=600):
    sim = from_snapshot(Simulator, Snapshot.get(snap))
    sim.set_tracer(zxdaad.Ports(sim))
    m, r, ops = sim.memory, sim.registers, sim.opcodes
    FD = 69888
    w = lambda a: m[a] | (m[a + 1] << 8)
    MT = w(0xfffd)
    font = w(MT + 330) if m[MT + 329] > 0 else 0x3d00
    glyphs = {}
    for c in range(32, 128): glyphs[bytes(m[font + (c - 32) * 8 + k] for k in range(8))] = chr(c)
    for c in range(21): glyphs.setdefault(bytes(m[MT + c * 8 + k] for k in range(8)), '�')   # UDG
    glyphs.setdefault(bytes(8), ' ')
    def screen(): return bytes(m[a] for a in range(0x4000, 0x5B00))
    def text(scr):
        lines = []
        for row in range(24):
            s = ''
            for col in range(32):
                cell = bytes(scr[((row & 0x18) << 8) | (k << 8) | ((row & 7) << 5) | col] for k in range(8))
                inv = bytes(b ^ 0xff for b in cell)
                ch = '«' if cursor and cell == cursor[0] else (glyphs.get(cell) or glyphs.get(inv))
                if ch is None: s = None; break          # un dibujo: la fila no es texto
                s += ES_MAP.get(ch, ch)
            lines.append(s.rstrip() if s is not None else '')
        return lines
    def frames(n):
        for _ in range(n):
            end = (r[25] // FD + 1) * FD
            while r[25] < end: ops[m[r[24]]]()
            if r[26]: sim.accept_interrupt(r, m, r[24])
    def key(code):
        m[23560] = code; m[23611] |= 0x20
        frames(3)
    def wait_quiet(raw=False, on_clear=None):
        """Espera a que la pantalla lleve 20 cuadros quieta. Si en medio el
        juego la borra (CLS), on_clear recibe el texto que había justo antes."""
        last = screen(); still = 0; n = 0
        while still < 20 and n < max_wait:
            frames(1); n += 1
            s = screen()
            if s == last: still += 1
            else:
                if on_clear and not any(s[:6144]) and any(last[:6144]): on_clear(text(last))
                still = 0; last = s
        return last if raw else text(last)
    # La última celda con algo de la pantalla: (fila, columna, bytes)
    def last_cell(scr):
        for row in range(23, -1, -1):
            for col in range(31, -1, -1):
                cell = bytes(scr[((row & 0x18) << 8) | (k << 8) | ((row & 7) << 5) | col] for k in range(8))
                if any(cell): return row, col, cell
        return None
    # La línea de órdenes: el prompt del juego (SM2 a SM5) y el cursor, que
    # cada juego dibuja como quiere y aquí se lee como «. El cursor se aprende
    # al empezar: un espacio tecleado en el editor de línea lo corre una celda
    # a la derecha (y luego se borra con DELETE); el prompt, de la primera
    # línea de órdenes que aparece.
    cursor, prompt = [], []
    def at_prompt(lines):
        last = [l for l in lines if l]
        if not (last and last[-1].endswith('«') and len(last[-1]) > 1): return False
        if not prompt: prompt.append(last[-1][:-1])
        return True
    stream = []            # líneas de texto, en orden, sin las que ya estaban
    prev = []
    def absorb(lines, cmd=None):
        nonlocal prev
        # el cursor «, fuera; la línea del prompt cambia al teclear
        P = prompt[0] if prompt else '»'
        cur = [l[:-1] if l.endswith(P + '«') else l for l in lines]
        old = [l[:-1] if l.endswith(P + '«') else l for l in prev]
        # lo que no cambia por arriba (el dibujo, o texto que no ha subido) se
        # deja aparte: el texto sube solo dentro de su ventana
        if prev:
            p = 0
            while p < 24 and old[p] == cur[p]: p += 1
            old, cur = old[p:], cur[p:]
        while old and not old[-1]: old.pop()
        # el mayor solapamiento: un final de old igual a un principio de cur
        # (la línea del prompt, "»", pasa a ser "»ORDEN"). Si la orden tecleada
        # ya no está y la pantalla es la misma de antes, el juego la borró y
        # volvió a escribir lo mismo (CLS y describir): todo es nuevo.
        same = lambda a, b: a == b or (a == P and b.startswith(P))
        k = 0
        echoed = cmd is None or any(l.startswith(P) and plain(l[len(P):]).startswith(plain(cmd)) for l in cur)
        if echoed or [l for l in cur if l] != [l for l in old if l]:
            for n in range(min(len(old), len(cur)), 0, -1):
                if all(same(a, b) for a, b in zip(old[-n:], cur[:n])): k = n; break
        new = cur[k:]
        if k and old[k - 1] == P and cur[k - 1] != P: new = [cur[k - 1]] + new   # la orden tecleada
        while new and not new[-1]: new.pop()
        stream.extend(new)
        prev = lines
    frames(50)
    scr = wait_quiet(raw=True)
    n = 0
    while not cursor and n < 12:                  # "Pulse una tecla", "Más..." o ya la línea de órdenes
        before, shown = last_cell(scr), text(scr)
        key(32); scr = wait_quiet(raw=True); n += 1
        after = last_cell(scr)
        if before and after and after[0] == before[0] and after[1] == before[1] + 1 and after[2] == before[2]:
            cursor.append(before[2]); key(12); scr = wait_quiet(raw=True)     # el espacio, fuera
        else: absorb(shown)                       # era una espera de tecla: esa pantalla cuenta
    lines = text(scr)
    absorb(lines)
    k = 0
    for c in cmds:
        # las letras del castellano se teclean con el símbolo que usa el juego
        # (ñ es "\\" en mayúsculas; las vocales acentuadas no existen en mayúsculas)
        TYPE = {'Ñ': '\\', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': '{', 'Ç': '~'}
        typed = ''.join(TYPE.get(ch, ch) for ch in c.upper())
        for ch in typed: key(ord(ch)); frames(2)
        key(13); lines = wait_quiet(on_clear=lambda t: absorb(t, c))
        n = 0
        while not at_prompt(lines) and n < 10:
            # una espera a mitad (PAUSE, ANYKEY, "Más..."): lo que haya en
            # pantalla se recoge cuando el juego la borre, o al final
            key(32); lines = wait_quiet(on_clear=lambda t: absorb(t, c)); n += 1
        absorb(lines, c)
        if shots: zxdaad.shot(m, f'{shots}/{k:02d}.png'); k += 1
    return stream, (prompt[0] if prompt else '»')


def words(s, cmds, prompts):
    """Palabras del texto, sin las órdenes tecleadas, los prompts ni las esperas
    de tecla. cmds: las órdenes, que en el JS van entre « y »; prompts: los del
    juego (en la pantalla del original, las líneas que empiezan por él)"""
    if cmds is not None:
        for c in cmds: s = s.replace('«' + c + '»', ' ')
        s = s.replace('{key}', ' ')
    else: s = '\n'.join(l for l in s.split('\n') if not l.startswith(tuple(p for p in prompts if p.strip())))
    for p in prompts:
        if p.strip(): s = s.replace(p, ' ')
    s = s.replace('\u00a0', ' ')
    return unicodedata.normalize('NFC', s).split()

if __name__ == '__main__':
    import difflib
    snap = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else '12345'
    out = tempfile.mkdtemp()
    if os.path.isfile(arg):
        # las órdenes del fichero: classic.mjs las coge del .txt junto al juego
        cmds = [l.strip() for l in open(arg, encoding='utf-8') if l.strip() and not l.startswith('#')]
        link = snap[:snap.rfind('.')] + '.txt'
        made = not os.path.exists(link)
        if made: open(link, 'w', encoding='utf-8').write('\n'.join(cmds) + '\n')
        try: subprocess.check_call(['node', os.path.join(HERE, 'classic.mjs'), snap, out], stdout=subprocess.DEVNULL)
        finally:
            if made: os.remove(link)
    else:
        subprocess.check_call(['node', os.path.join(HERE, 'classic.mjs'), snap, out, arg], stdout=subprocess.DEVNULL)
        cmds = open(os.path.join(out, '0.cmds'), encoding='utf-8').read().split('\n')[:-1]
    js = open(os.path.join(out, '0.js.txt'), encoding='utf-8').read()
    info = json.load(open(os.path.join(out, '0.json'), encoding='utf-8'))
    lines, prompt = run(snap, cmds)
    orig = '\n'.join(lines)
    a, b = words(orig, None, [prompt]), words(js, cmds, info.get('prompts', ['»']))
    n = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal': continue
        # solo cambia dónde se parte: "son:" y "ninguna." frente a "son:ninguna."
        if ''.join(a[i1:i2]) == ''.join(b[j1:j2]): continue
        n += 1
        print('original:', ' '.join(a[max(0, i1 - 6):i2 + 6]))
        print('js      :', ' '.join(b[max(0, j1 - 6):j2 + 6]))
        print()
    print('%d órdenes; %s' % (len(cmds), 'el texto es el mismo (%d palabras)' % len(a) if not n else '%d diferencias' % n))
    sys.exit(1 if n else 0)
