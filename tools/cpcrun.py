"""Arranca un disco de Amstrad CPC en MAME (cpc6128) y lee la pantalla.

Necesita MAME y las ROM del CPC 6128 (tools/setup-cpc.sh las deja en .roms/;
no forman parte de Rocinante). Las capturas de MAME son de 768x272: cada punto
de modo 1 son 2 de ancho, con 64 de borde a la izquierda y 37 arriba.

    run(imagen, pasos) -> lista de capturas (PIL.Image), una por cada 'snap'
    imagen: .dsk (6128) o .cdt (464)
    pasos: ('wait', fotogramas), ('type', texto), ('snap',)
    text(img, charset) -> líneas de texto de la pantalla (40 columnas)
"""
import os, shutil, subprocess, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROMS = os.environ.get('CPC_ROMS', os.path.join(HERE, '..', '.roms'))
MAME = shutil.which('mame') or '/usr/games/mame'
X0, Y0 = 64, 37
ES = 'ª¡¿«»áéíóúñÑçÇüÜ'

LUA = r'''
local steps = {}
for line in io.lines(os.getenv("CPC_SCRIPT")) do table.insert(steps, line) end
local i, wait = 1, 0
emu.register_frame_done(function()
  if wait > 0 then wait = wait - 1 return end
  if i > #steps then manager.machine:exit() return end
  local s = steps[i]; i = i + 1
  local cmd, arg = s:match("^(%S+)%s?(.*)$")
  if cmd == "wait" then wait = tonumber(arg)
  elseif cmd == "type" then manager.machine.natkeyboard:post_coded(arg)
  elseif cmd == "snap" then manager.machine.video:snapshot()
  elseif cmd == "play" then for _, c in pairs(manager.machine.cassettes) do c:play() end
  end
end)
'''

def available():
    return os.path.exists(MAME) and os.path.exists(os.path.join(ROMS, 'cpc6128', 'cpc6128.rom'))

def available464():
    return os.path.exists(MAME) and os.path.exists(os.path.join(ROMS, 'cpc464', 'cpc464.rom'))

def run(image, steps, boot=True, machine='cpc6128'):
    """image: .dsk (arranca con RUN"DISC") o .cdt o .wav (en el 464, con RUN"")"""
    tmp = tempfile.mkdtemp(prefix='cpc')
    lines = []
    tape = image.lower().endswith(('.cdt', '.wav'))
    if tape:
        machine = 'cpc464'
    if boot and tape:
        lines += ['wait 150', 'type run"{ENTER}', 'wait 150', 'type {ENTER}', 'wait 25', 'play']
    elif boot:
        lines += ['wait 150', 'type run"disc{ENTER}']
    for s in steps:
        if s[0] == 'type':
            # natkeyboard: {ENTER} para la tecla de retorno
            lines.append('type ' + s[1].replace('\n', '{ENTER}'))
        else:
            lines.append(' '.join(str(v) for v in s))
    script = os.path.join(tmp, 'steps.txt')
    open(script, 'w').write('\n'.join(lines) + '\n')
    lua = os.path.join(tmp, 'run.lua')
    open(lua, 'w').write(LUA)
    env = dict(os.environ, CPC_SCRIPT=script, SDL_VIDEODRIVER='dummy', SDL_AUDIODRIVER='dummy')
    media = ['-cass', os.path.abspath(image)] if tape else ['-flop1', os.path.abspath(image)]
    subprocess.run([MAME, machine, '-rompath', ROMS, *media, '-video', 'none',
                    '-sound', 'none', '-nothrottle', '-skip_gameinfo', '-snapshot_directory', tmp,
                    '-autoboot_script', lua, '-nvram_directory', tmp, '-cfg_directory', tmp],
                   env=env, cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
    d = os.path.join(tmp, machine)
    shots = [Image.open(os.path.join(d, f)).convert('RGB') for f in sorted(os.listdir(d))] if os.path.isdir(d) else []
    for im in shots:
        im.load()
    shutil.rmtree(tmp, ignore_errors=True)
    return shots

def pixel(img, x, y):
    """Color del punto (x, y) de modo 1 (y = línea de pantalla desde arriba)"""
    return img.getpixel((X0 + 2 * x, Y0 + y))

def text(img, charset, paper=(0, 0, 0)):
    """Lee las 25 filas de 40 caracteres comparando con el juego de caracteres"""
    glyphs = {}
    for c in range(32, 128):
        glyphs.setdefault(bytes(charset[c * 8:c * 8 + 8]), chr(c))
    for c in range(16, 32):
        glyphs.setdefault(bytes(charset[c * 8:c * 8 + 8]), ES[c - 16])
    out = []
    for row in range(25):
        s = ''
        for col in range(40):
            cell = bytes(sum(0x80 >> k for k in range(8) if pixel(img, col * 8 + k, row * 8 + r) != paper) for r in range(8))
            s += glyphs.get(cell, '\0' if any(cell) else ' ')
        out.append(s.rstrip())
    return out
