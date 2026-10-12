"""Arranca un cartucho de MSX en openMSX, con C-BIOS, y lee la pantalla.

Necesita openMSX, C-BIOS (apt install openmsx cbios; C-BIOS es libre) y Xvfb.
openMSX se maneja por su entrada estándar (-control stdio): órdenes de Tcl
dentro de <command>, como type y screenshot. Las capturas "raw" (la imagen
del VDP, sin escalar ni filtros) son de 320x240 con la pantalla del MSX
(256x192) en el centro; run() las devuelve recortadas a 256x192.

    run(rom, pasos) -> lista de capturas (PIL.Image de 256x192)
    pasos: ('wait', segundos), ('type', texto), ('snap',): cuando la pantalla
      deja de cambiar, ('ready',): espera
      a que salga texto blanco sobre negro (y un poco más: el intérprete vacía
      el teclado antes de esperar una tecla)
    text(img, charset) -> las 24 filas de texto (42 columnas de 6 puntos)
"""
import html, os, shutil, signal, subprocess, tempfile, time
from PIL import Image

MACHINE = os.environ.get('MSX_MACHINE', 'C-BIOS_MSX1_EU')
ES = 'ª¡¿«»áéíóúñÑçÇüÜ'
X0, Y0 = 32, 24

def _roms():
    """openMSX busca las ROM del sistema en ~/.openMSX/share/systemroms"""
    d = os.path.expanduser('~/.openMSX/share/systemroms')
    if not os.path.exists(d) and os.path.isdir('/usr/share/cbios'):
        os.makedirs(os.path.dirname(d), exist_ok=True)
        os.symlink('/usr/share/cbios', d)
    return os.path.exists(os.path.join(d, 'cbios_main_msx1_eu.rom')) or os.path.exists(os.path.join(d, 'cbios_main_msx1.rom'))

def available():
    return bool(shutil.which('openmsx') and shutil.which('xvfb-run') and _roms())

def run(rom, steps, boot_wait=3):
    tmp = tempfile.mkdtemp(prefix='msx')
    p = subprocess.Popen(['xvfb-run', '-a', 'openmsx', '-machine', MACHINE, '-cart', os.path.abspath(rom), '-control', 'stdio'],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=tmp,
                         start_new_session=True)
    p.stdin.write(b'<openmsx-control>\n'); p.stdin.flush()

    def cmd(c):
        p.stdin.write(('<command>%s</command>\n' % html.escape(c)).encode()); p.stdin.flush()
        # la respuesta: una línea <reply ...>
        while True:
            line = p.stdout.readline().decode('utf8', 'replace')
            if not line:
                raise RuntimeError('openMSX se ha cerrado')
            if '<reply' in line:
                return line
    shots = []

    def snap():
        f = os.path.join(tmp, 's%03d.png' % len(os.listdir(tmp)))
        cmd('screenshot -raw %s' % f)
        im = Image.open(f).convert('RGB')
        return im.crop((X0, Y0, X0 + 256, Y0 + 192))
    try:
        # con -control stdio no hay ventana si no se pide
        cmd('set renderer SDLGL-PP')
        cmd('set mute on')
        # con -control stdio, la máquina empieza apagada
        cmd('set power on')
        time.sleep(boot_wait)
        for st in steps:
            if st[0] == 'wait':
                time.sleep(st[1])
            elif st[0] == 'type':
                txt = st[1].replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\r')
                cmd('type -release -freq 8 "%s"' % txt)
                # type vuelve enseguida: se espera a que acabe de teclear
                time.sleep(len(st[1]) / 8 + 0.5)
            elif st[0] == 'snap':
                # el MSX escribe despacio: se espera a que la pantalla no cambie
                im = snap()
                for _ in range(20):
                    time.sleep(0.7)
                    im2 = snap()
                    if im2.tobytes() == im.tobytes():
                        break
                    im = im2
                shots.append(im)
            elif st[0] == 'ready':
                for _ in range(st[1] if len(st) > 1 else 60):
                    im = snap()
                    # texto blanco sobre negro (no la pantalla azul de C-BIOS)
                    px = list(im.getdata())
                    white = sum(1 for p in px if min(p) > 200)
                    black = sum(1 for p in px if max(p) < 40)
                    if white > 50 and black > len(px) // 2:
                        break
                    time.sleep(0.5)
                time.sleep(3)
        try:
            cmd('exit')
        except RuntimeError:
            pass
    finally:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        # xvfb-run, Xvfb y openMSX: todo el grupo, por si algo ha fallado
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        shutil.rmtree(tmp, ignore_errors=True)
    return shots

def pixel(img, x, y):
    return img.getpixel((x, y))

def text(img, charset):
    """Lee las 24 filas de 42 caracteres de 6 puntos (los 6 bits altos de cada
    fila del carácter): en cada cuadro, los puntos de la tinta frente a los
    del papel"""
    glyphs = {}
    for c in sorted(range(32, 128), key=lambda c: (not chr(c).isalpha(), c)):
        glyphs.setdefault(bytes(b & 0xfc for b in charset[c * 8:c * 8 + 8]), chr(c))
    for c in range(16, 32):
        glyphs.setdefault(bytes(b & 0xfc for b in charset[c * 8:c * 8 + 8]), ES[c - 16])
    out = []
    for row in range(24):
        s = ''
        for col in range(42):
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
