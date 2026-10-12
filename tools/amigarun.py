"""Arranca un disco de Amiga en FS-UAE (un A500 con Kickstart 1.3) y lee la
pantalla.

Necesita FS-UAE, Xvfb y xdotool, y el Kickstart 1.3 en .roms/amiga/kick13.rom
(es de Cloanto, viene por ejemplo con Amiga Forever; no forma parte de
Rocinante). Arranca en modo turbo (warp) para que la carga no tarde, y lo
quita al ver texto en pantalla ('ready'), antes de teclear. Las teclas se mandan con xdotool a la ventana de FS-UAE, que
tiene que tener el foco (FS-UAE no hace caso de las pulsaciones sintéticas
mandadas a una ventana). Las capturas son las de FS-UAE (aquí, con la tecla Pausa, que el Amiga no
tiene): la "crop" es
la imagen del Amiga con cada punto de baja resolución doblado; run() las
devuelve a 1:1 y recortadas a la pantalla de DAAD (320x200), que empieza en
X0, Y0.

    run(adf, pasos) -> lista de capturas (PIL.Image de 320x200)
    pasos: ('wait', segundos), ('type', texto), ('snap',), ('ready',): espera
      a que salga texto
    text(img, charset) -> las 25 filas de texto (53 columnas de 6 puntos)
"""
import glob, os, shutil, subprocess, tempfile, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROMS = os.environ.get('AMIGA_ROMS', os.path.join(HERE, '..', '.roms', 'amiga'))
KICK = os.path.join(ROMS, 'kick13.rom')
X0, Y0 = None, None          # se calcula en la primera captura (ver _origin)

def available():
    return all(shutil.which(p) for p in ('fs-uae', 'Xvfb', 'xdotool')) and os.path.exists(KICK)

def _display():
    for n in range(120, 160):
        if not os.path.exists('/tmp/.X%d-lock' % n):
            return n
    return 159

def run(adf, steps, boot_wait=8, warp=True):
    tmp = tempfile.mkdtemp(prefix='amiga')
    shots_dir = os.path.join(tmp, 'scr')
    os.mkdir(shots_dir)
    disk = os.path.join(tmp, 'disco.adf')
    shutil.copy(adf, disk)
    n = _display()
    env = dict(os.environ, DISPLAY=':%d' % n)
    xv = subprocess.Popen(['Xvfb', ':%d' % n, '-screen', '0', '1024x768x24'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    fs = subprocess.Popen(['fs-uae', '--base_dir=' + os.path.join(tmp, 'base'), '--amiga_model=A500',
                           '--kickstart_file=' + os.path.abspath(KICK), '--floppy_drive_0=' + disk,
                           '--floppy_drive_speed=0', '--fullscreen=0', '--window_width=1024', '--window_height=768',
                           '--audio_driver=null', '--screenshots_output_dir=' + shots_dir,
                           '--warp_mode=%d' % warp,
                           # Pausa hace la captura y F9 quita o pone el modo turbo (no
                           # llegan al Amiga)
                           '--keyboard_key_pause=action_screenshot', '--keyboard_key_f9=action_warp'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, cwd=tmp)
    def x(*a):
        # el foco, antes de cada tecla: FS-UAE solo lee el teclado con foco
        if a[0] in ('key', 'keydown'):
            subprocess.run(['xdotool', 'windowfocus', '--sync', win], env=env, capture_output=True)
        return subprocess.run(['xdotool', *a], env=env, capture_output=True, text=True).stdout
    shots = []
    win = ''
    try:
        for _ in range(50):
            win = x('search', '--name', 'FS-UAE').split()
            if win:
                win = win[0]
                break
            time.sleep(0.2)
        time.sleep(boot_wait)
        x('windowfocus', '--sync', win)
        # FS-UAE pierde la primera tecla que recibe: se gasta aquí, mientras
        # arranca (si llegara, el intérprete vacía el teclado antes de
        # esperar una tecla)
        x('keydown', 'shift'); time.sleep(0.1); x('keyup', 'shift')
        x('keydown', 'Return'); time.sleep(0.1); x('keyup', 'Return')
        for st in steps:
            if st[0] == 'wait':
                time.sleep(st[1])
            elif st[0] == 'type':
                for ch in st[1]:
                    # pulsación lenta, como una de verdad: si se suelta en el
                    # mismo cuadro, el Amiga puede perderla
                    k = {' ': 'space', '\n': 'Return', '.': 'period', ',': 'comma'}.get(ch, ch)
                    x('keydown', k); time.sleep(0.06); x('keyup', k)
                    time.sleep(0.1)
            elif st[0] == 'snap':
                shots.append(_screen(_snap(x, shots_dir)))
            elif st[0] == 'ready':
                # espera a que haya texto en pantalla (la carga desde el
                # disquete tarda), mirando cada poco
                for _ in range(st[1] if len(st) > 1 else 60):
                    im = _screen(_snap(x, shots_dir))
                    if sum(1 for p in im.getdata() if p == (255, 255, 255)) > 100:
                        break
                    time.sleep(1)
                # sin turbo para teclear: si no, se pierden pulsaciones
                if warp:
                    x('key', 'F9')
                # el intérprete vacía el teclado antes de esperar una tecla:
                # se le da tiempo a llegar a la espera
                time.sleep(3)
    finally:
        fs.kill(); xv.kill()
        fs.wait(); xv.wait()
        shutil.rmtree(tmp, ignore_errors=True)
    return shots

def _snap(x, shots_dir):
    """Captura de FS-UAE (Alt+S), a 1:1"""
    before = set(glob.glob(os.path.join(shots_dir, '*crop*.png')))
    for _ in range(5):
        x('key', 'Pause')
        for _ in range(30):
            new = set(glob.glob(os.path.join(shots_dir, '*crop*.png'))) - before
            if new:
                time.sleep(0.3)
                im = Image.open(new.pop()).convert('RGB')
                return im.resize((im.width // 2, im.height // 2), Image.NEAREST)
            time.sleep(0.1)
    raise RuntimeError('FS-UAE no ha hecho la captura')

def _screen(im):
    ox, oy = _origin(im)
    return im.crop((ox, oy, ox + 320, oy + 200))

def _origin(im):
    """Dónde empieza la pantalla de DAAD en la captura: FS-UAE recorta el
    borde, pero no siempre igual. Se toma el borde del recorte y se centra
    la pantalla de 320 puntos en el ancho; arriba, la imagen va pegada al
    principio de la zona visible."""
    w, h = im.size
    return max(0, (w - 320) // 2), max(0, min(h - 200, (h - 256) // 2 if h >= 256 else 0))

def pixel(img, x, y):
    return img.getpixel((x, y))

def text(img, charset):
    import strun
    return strun.text(img, charset)
