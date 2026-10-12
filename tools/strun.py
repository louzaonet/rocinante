"""Arranca un disco de Atari ST en Hatari con EmuTOS y lee la pantalla.

Necesita Hatari, Xvfb y una imagen de EmuTOS de 256 KB (tools/setup-atari.sh
la deja en .roms/atari; EmuTOS es libre, GPL, pero no forma parte de
Rocinante). Hatari se maneja por una fifo de órdenes: pulsaciones de teclas
(hatari-event keypress) y capturas (hatari-shortcut screenshot). Sin bordes,
las capturas son de 640x400: la baja resolución (320x200) con cada punto
doblado; run() las devuelve ya reducidas a 320x200.

    run(st, pasos) -> lista de capturas (PIL.Image), una por cada 'snap'
    pasos: ('wait', segundos), ('type', texto), ('snap',): cuando la pantalla
      deja de cambiar
    text(img, charset) -> las 25 filas de texto (53 columnas de 6 puntos)
"""
import glob, os, shutil, subprocess, tempfile, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROMS = os.environ.get('ATARI_ROMS', os.path.join(HERE, '..', '.roms', 'atari'))
ES = 'ª¡¿«»áéíóúñÑçÇüÜ'
# códigos de tecla del ST para lo que no es letra ni cifra
KEYS = {' ': 57, '\n': 28, '.': 52, ',': 51, '-': 12, '\b': 14}

def tos():
    for n in ('etos256es.img', 'etos256us.img', 'etos256uk.img'):
        f = os.path.join(ROMS, n)
        if os.path.exists(f):
            return f
    found = sorted(glob.glob(os.path.join(ROMS, 'etos256*.img')))
    return found[0] if found else None

def available():
    return bool(shutil.which('hatari') and shutil.which('xvfb-run') and tos())

def run(st, steps, boot_wait=20):
    tmp = tempfile.mkdtemp(prefix='st')
    fifo = os.path.join(tmp, 'fifo')
    shots_dir = os.path.join(tmp, 'shots')
    os.mkdir(shots_dir)
    # el disco se copia: el intérprete puede escribir en él (SAVE)
    disk = os.path.join(tmp, 'disco.st')
    shutil.copy(st, disk)
    p = subprocess.Popen(['xvfb-run', '-a', 'hatari', '--confirm-quit', 'no', '--tos', tos(),
                          '--machine', 'st', '--memsize', '1024', '--monitor', 'rgb',
                          '--borders', 'no', '--zoom', '1', '--statusbar', 'no', '--drive-led', 'no',
                          '--sound', 'off', '--fast-boot', 'yes', '--disk-a', disk,
                          '--screenshot-dir', shots_dir, '--cmd-fifo', fifo],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=tmp)
    for _ in range(100):
        if os.path.exists(fifo):
            break
        time.sleep(0.1)

    def cmd(c):
        with open(fifo, 'w') as f:
            f.write(c + '\n')
        time.sleep(0.06)
    shots = []

    def snap():
        before = set(os.listdir(shots_dir))
        cmd('hatari-shortcut screenshot')
        f = None
        for _ in range(50):
            new = set(os.listdir(shots_dir)) - before
            if new:
                f = os.path.join(shots_dir, new.pop())
                break
            time.sleep(0.1)
        time.sleep(0.2)
        im = Image.open(f).convert('RGB')
        if im.size == (640, 400):
            im = im.resize((320, 200), Image.NEAREST)
        im.load()
        return im
    try:
        time.sleep(boot_wait)
        for st_ in steps:
            if st_[0] == 'wait':
                time.sleep(st_[1])
            elif st_[0] == 'type':
                for ch in st_[1]:
                    k = KEYS.get(ch, ch)
                    cmd('hatari-event keypress %s' % k)
            elif st_[0] == 'snap':
                # se espera a que la pantalla deje de cambiar (si no, puede
                # salir una línea a medio escribir)
                im = snap()
                for _ in range(10):
                    time.sleep(0.5)
                    im2 = snap()
                    if im2.tobytes() == im.tobytes():
                        break
                    im = im2
                shots.append(im)
        cmd('hatari-shortcut quit')
    finally:
        try:
            p.wait(timeout=20)
        except subprocess.TimeoutExpired:
            p.kill()
            subprocess.run(['pkill', '-f', disk])
        shutil.rmtree(tmp, ignore_errors=True)
    return shots

def pixel(img, x, y):
    """Color del punto (x, y) de la pantalla de 320x200 (y desde arriba)"""
    return img.getpixel((x, y))

def text(img, charset):
    """Lee las 25 filas de 53 caracteres de 6 puntos comparando con el juego
    de caracteres (los 6 bits altos de cada fila): en cada cuadro, los puntos
    de la tinta frente a los del papel"""
    glyphs = {}
    for c in sorted(range(32, 128), key=lambda c: (not chr(c).isalpha(), c)):
        glyphs.setdefault(bytes(b & 0xfc for b in charset[c * 8:c * 8 + 8]), chr(c))
    for c in range(16, 32):
        glyphs.setdefault(bytes(b & 0xfc for b in charset[c * 8:c * 8 + 8]), ES[c - 16])
    out = []
    for row in range(25):
        s = ''
        for col in range(53):
            px = [[img.getpixel((col * 6 + k, row * 8 + r)) for k in range(6)] for r in range(8)]
            colours = {}
            for line in px:
                for c in line:
                    colours[c] = colours.get(c, 0) + 1
            if len(colours) == 1:
                s += ' '
                continue
            paper = max(colours, key=colours.get)
            cell = bytes(sum(0x80 >> k for k in range(6) if px[r][k] != paper) for r in range(8))
            inv = bytes(0xfc - b for b in cell)
            s += glyphs.get(cell) or glyphs.get(inv) or '\0'
        out.append(s.rstrip())
    return out
