"""Arranca un juego de PC (MS-DOS) en DOSBox y lee la pantalla.

Necesita DOSBox, Xvfb y xdotool (apt install dosbox xvfb xdotool). No hace
falta ninguna ROM: DOSBox trae su propio DOS. Las teclas se mandan a la
ventana de DOSBox con xdotool y las capturas son las de DOSBox (Ctrl+F5):
la pantalla tal cual, 320x200 en los modos gráficos.

    run(origen, pasos, orden='JUGAR') -> lista de capturas (PIL.Image)
      origen: carpeta con el juego (se monta como C:) o disquete .img (A:)
    pasos: ('wait', segundos), ('type', texto), ('snap',)
    text(img, charset) -> las 25 filas de texto (53 columnas de 6 puntos)
"""
import os, shutil, subprocess, tempfile, time
from PIL import Image

def available():
    return all(shutil.which(p) for p in ('dosbox', 'Xvfb', 'xdotool'))

def _display():
    for n in range(80, 120):
        if not os.path.exists('/tmp/.X%d-lock' % n):
            return n
    return 99

def run(origin, steps, command='JUGAR', boot_wait=5):
    tmp = tempfile.mkdtemp(prefix='dos')
    caps = os.path.join(tmp, 'cap')
    os.mkdir(caps)
    src = os.path.abspath(origin)
    if src.lower().endswith('.img'):
        disk = os.path.join(tmp, 'disco.img')
        shutil.copy(src, disk)
        mount = 'imgmount a "%s" -t floppy\na:' % disk
    else:
        game = os.path.join(tmp, 'juego')
        shutil.copytree(src, game)
        mount = 'mount c "%s"\nc:' % game
    conf = os.path.join(tmp, 'dosbox.conf')
    with open(conf, 'w') as f:
        f.write('[sdl]\noutput=surface\n[dosbox]\ncaptures=%s\nmemsize=16\n[cpu]\ncycles=max\n'
                '[mixer]\nnosound=true\n[speaker]\npcspeaker=false\n[autoexec]\n%s\n%s\n' % (caps, mount, command))
    n = _display()
    env = dict(os.environ, DISPLAY=':%d' % n)
    xv = subprocess.Popen(['Xvfb', ':%d' % n, '-screen', '0', '1024x768x24'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    db = subprocess.Popen(['dosbox', '-conf', conf], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, cwd=tmp)
    shots = []
    try:
        win = ''
        for _ in range(50):
            win = subprocess.run(['xdotool', 'search', '--class', 'dosbox'], capture_output=True, text=True, env=env).stdout.split()
            if win:
                win = win[0]
                break
            time.sleep(0.2)
        time.sleep(boot_wait)

        def key(*k):
            subprocess.run(['xdotool', 'key', '--window', win, *k], env=env)
        for st in steps:
            if st[0] == 'wait':
                time.sleep(st[1])
            elif st[0] == 'type':
                for ch in st[1]:
                    key({' ': 'space', '\n': 'Return', '.': 'period', ',': 'comma'}.get(ch, ch))
                    time.sleep(0.05)
            elif st[0] == 'snap':
                before = set(os.listdir(caps))
                key('ctrl+F5')
                f = None
                for _ in range(50):
                    new = set(os.listdir(caps)) - before
                    if new:
                        f = os.path.join(caps, new.pop())
                        break
                    time.sleep(0.1)
                time.sleep(0.3)
                im = Image.open(f).convert('RGB'); im.load(); shots.append(im)
    finally:
        db.kill(); xv.kill()
        db.wait(); xv.wait()
        shutil.rmtree(tmp, ignore_errors=True)
    return shots

def pixel(img, x, y):
    return img.getpixel((x, y))

def text(img, charset):
    """Igual que en strun: 25 filas de 53 caracteres de 6 puntos"""
    import strun
    return strun.text(img, charset)
