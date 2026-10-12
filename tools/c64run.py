"""Arranca un disco de Commodore 64 en VICE (x64sc) y lee la pantalla.

Necesita VICE, Xvfb (VICE de Debian es de GTK y pide una pantalla) y las ROM
del C64 y de la 1541 (tools/setup-c64.sh las deja en .roms/vice/C64 y DRIVES; no forman
parte de Rocinante). VICE se maneja por su monitor remoto: keybuf para teclear
y screenshot para las capturas, que son de 384x272 con 32 puntos de borde a la
izquierda y 35 arriba. Va en modo warp, así que las esperas son en segundos
reales.

    run(d64, pasos) -> lista de capturas (PIL.Image), una por cada 'snap'
    pasos: ('wait', segundos), ('type', texto), ('snap',), ('mem', desde, hasta)
    text(img, charset) -> las 25 filas de texto (40 columnas)
"""
import os, shutil, socket, subprocess, tempfile, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROMS = os.environ.get('C64_ROMS', os.path.join(HERE, '..', '.roms', 'vice'))
X0, Y0 = 32, 35
ES = 'ª¡¿«»áéíóúñÑçÇüÜ'

def available():
    return bool(shutil.which('x64sc') and shutil.which('xvfb-run') and os.path.exists(os.path.join(ROMS, 'C64', 'kernal-901227-03.bin')))

def _free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def run(d64, steps, boot_wait=20):
    tmp = tempfile.mkdtemp(prefix='c64')
    port = _free_port()
    # VICE busca las ROM en $XDG_DATA_HOME/vice/C64 y .../DRIVES
    env = dict(os.environ, XDG_DATA_HOME=os.path.dirname(os.path.abspath(ROMS)))
    p = subprocess.Popen(['xvfb-run', '-a', 'x64sc', '-default', '-silent', '-sounddev', 'dummy', '-warp',
                          '-drive8type', '1541', '-drive8truedrive',
                          '-remotemonitor', '-remotemonitoraddress', 'ip4://127.0.0.1:%d' % port,
                          '-autostart', os.path.abspath(d64)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=tmp, env=env)
    s = None
    for _ in range(100):
        try:
            s = socket.create_connection(('127.0.0.1', port)); break
        except OSError:
            time.sleep(0.2)
    s.settimeout(0.3)

    def cmd(c):
        s.sendall((c + '\n').encode('latin1'))
        time.sleep(0.2)
        got = b''
        try:
            while True:
                b = s.recv(65536)
                if not b:
                    break
                got += b
        except socket.timeout:
            pass
        return got.decode('latin1')
    shots = []
    n = [0]

    def shot():
        f = os.path.join(tmp, 's%03d.png' % n[0]); n[0] += 1
        cmd('screenshot "%s" 2' % f)
        cmd('x')
        for _ in range(50):
            if os.path.exists(f) and os.path.getsize(f):
                break
            time.sleep(0.1)
        time.sleep(0.2)
        im = Image.open(f).convert('RGB'); im.load()
        return im
    try:
        cmd('x')
        time.sleep(boot_wait)
        for st in steps:
            if st[0] == 'wait':
                time.sleep(st[1])
            elif st[0] == 'type':
                # keybuf sin comillas (las teclearía); \n es RETURN y \x20 el espacio
                txt = ''.join('\\n' if c == '\n' else '\\x%02x' % ord(c) if c in ' "\\' else c for c in st[1])
                cmd('keybuf ' + txt)
                cmd('x')
            elif st[0] == 'mem':                     # ('mem', desde, hasta): volcado del monitor
                shots.append(cmd('m %04x %04x' % (st[1], st[2])))
                cmd('x')
            elif st[0] == 'snap':
                # se espera a que la pantalla deje de cambiar (la carga o un
                # dibujo a medias darían otra cosa)
                im = shot()
                for _ in range(15):
                    time.sleep(0.7)
                    im2 = shot()
                    if im2.tobytes() == im.tobytes():
                        break
                    im = im2
                shots.append(im)
        cmd('quit')
    finally:
        try:
            p.wait(timeout=20)
        except subprocess.TimeoutExpired:
            p.kill()
        shutil.rmtree(tmp, ignore_errors=True)
    return shots

def pixel(img, x, y):
    """Color del punto (x, y) de la pantalla de 320x200 (y desde arriba)"""
    return img.getpixel((X0 + x, Y0 + y))

def text(img, charset):
    """Lee las 25 filas de 40 caracteres comparando con el juego de caracteres:
    en cada cuadro, los puntos del color de la tinta frente a los del papel"""
    glyphs = {}
    # si dos caracteres tienen el mismo dibujo (la l y el 1 en la fuente del
    # C64), gana la letra
    for c in sorted(range(32, 128), key=lambda c: (not chr(c).isalpha(), c)):
        glyphs.setdefault(bytes(charset[c * 8:c * 8 + 8]), chr(c))
    for c in range(16, 32):
        glyphs.setdefault(bytes(charset[c * 8:c * 8 + 8]), ES[c - 16])
    out = []
    for row in range(25):
        s = ''
        for col in range(40):
            px = [[pixel(img, col * 8 + k, row * 8 + r) for k in range(8)] for r in range(8)]
            colours = {}
            for line in px:
                for c in line:
                    colours[c] = colours.get(c, 0) + 1
            if len(colours) == 1:
                s += ' '
                continue
            paper = max(colours, key=colours.get)
            cell = bytes(sum(0x80 >> k for k in range(8) if px[r][k] != paper) for r in range(8))
            inv = bytes(255 - b for b in cell)
            s += glyphs.get(cell) or glyphs.get(inv) or '\0'
        out.append(s.rstrip())
    return out
