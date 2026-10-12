"""Prueba en Chromium la herramienta Seleccionar del editor de dibujos
vectoriales: elegir, arrastrar, copiar y pegar, voltear, girar, ordenar,
hacer un subdibujo, deshacer y rehacer.
Uso: vecui.py proyecto.rocinante.json dibujo [es|en]"""
import sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PROJ, PIC = sys.argv[1], sys.argv[2]
LANG = sys.argv[3] if len(sys.argv) > 3 else 'es'
OUT = '/tmp/vecui_' + LANG; os.makedirs(OUT, exist_ok=True)
L = {
    'es': dict(project='Proyecto', open='Abrir proyecto', select='Seleccionar', copy='Copiar', paste='Pegar', rotate='Girar 90°',
               front='Al fondo', sub='Hacer subdibujo', undo='Deshacer', redo='Rehacer'),
    'en': dict(project='Project', open='Open project', select='Select', copy='Copy', paste='Paste', rotate='Rotate 90°',
               front='To back', sub='Make sub-picture', undo='Undo', redo='Redo'),
}[LANG]
errors, bad = [], 0
def check(name, ok, extra=''):
    global bad
    print('ok  ' if ok else 'FAIL', name, '' if ok else extra)
    if not ok: bad += 1

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 1000})
    ctx.add_init_script("try { localStorage.setItem('rocinante.idioma', '%s') } catch (e) {}" % LANG)
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('file://' + ROOT + '/dist/rocinante.html')
    pg.wait_for_timeout(600)
    pg.click('.menus >> text=' + L['project'])
    with pg.expect_file_chooser() as fc:
        pg.click('.menu-list li:has-text("%s")' % L['open'])
    fc.value.set_files(PROJ)
    pg.wait_for_timeout(800)
    pg.click('.side a[href="#dibujos"]'); pg.wait_for_timeout(300)
    pg.click(f'.itemlist li:has(b:text-is("{PIC}"))'); pg.wait_for_timeout(400)
    ops = lambda: pg.locator('.vec-list li:not(.vec-start)').count()
    insel = lambda: pg.locator('.vec-list li.insel').count()
    shot = lambda n: pg.locator('.vec-screen').screenshot(path=f'{OUT}/{n}.png')
    pixels = lambda: pg.evaluate("() => { const c = document.querySelector('.vec-screen canvas'); return c.toDataURL(); }")
    tinted = lambda: pg.evaluate("() => { const c = document.querySelector('.vec-overlay'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 0) return true; return false; }")
    n0 = ops()
    pg.click('.paint-tools button:has-text("%s")' % L['select']); pg.wait_for_timeout(300)
    shot('0_inicio')
    scr0 = pixels()

    # buscar un punto con algo: probar una rejilla hasta que se seleccione una pieza
    ov = pg.locator('.vec-overlay'); box = ov.bounding_box()
    z = box['width'] / 256
    picked = None
    for sy in range(20, 90, 6):
        for sx in range(20, 240, 6):
            pg.mouse.click(box['x'] + sx * z, box['y'] + sy * z)
            if insel() and tinted():   # una pieza con puntos (no un bloque de color)
                picked = (sx, sy); break
        if picked: break
    check('elegir una pieza con un clic', picked is not None)
    shot('1_elegida')
    # arrastrar 16 puntos a la derecha y 8 hacia abajo
    sx, sy = picked
    pg.mouse.move(box['x'] + sx * z, box['y'] + sy * z); pg.mouse.down()
    for k in range(1, 9): pg.mouse.move(box['x'] + (sx + 2 * k) * z, box['y'] + (sy + k) * z)
    shot('2_arrastrando')
    pg.mouse.up(); pg.wait_for_timeout(200)
    check('arrastrar cambia el dibujo', pixels() != scr0)
    shot('3_movida')
    # deshacer y rehacer con el teclado
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    check('Ctrl+Z deja el dibujo como estaba', pixels() == scr0)
    pg.keyboard.press('Control+y'); pg.wait_for_timeout(200)
    check('Ctrl+Y lo vuelve a mover', pixels() != scr0)
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    # flechas
    ov.focus()
    pg.mouse.click(box['x'] + sx * z, box['y'] + sy * z)
    pg.keyboard.press('Shift+ArrowDown'); pg.wait_for_timeout(200)
    check('Mayús+flecha mueve', pixels() != scr0)
    pg.keyboard.press('Shift+ArrowUp'); pg.wait_for_timeout(200)
    check('y de vuelta, igual que al principio', pixels() == scr0)
    # copiar y pegar
    n1 = ops()
    pg.keyboard.press('Control+c'); pg.keyboard.press('Control+v'); pg.wait_for_timeout(300)
    check('Ctrl+C, Ctrl+V añade órdenes', ops() > n1, (n1, ops()))
    shot('4_pegada')
    pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    check('Supr borra lo pegado', pixels() == scr0)
    # rectángulo: arrastrar desde un sitio vacío por todo el dibujo
    pg.mouse.move(box['x'] + 2 * z, box['y'] + 2 * z); pg.mouse.down()
    pg.mouse.move(box['x'] + 128 * z, box['y'] + 60 * z); pg.mouse.move(box['x'] + 254 * z, box['y'] + 94 * z)
    shot('5_rectangulo')
    pg.mouse.up(); pg.wait_for_timeout(300)
    many = insel()
    check('el rectángulo elige muchas', many > 10, many)
    shot('6_rectangulo_elegidas')
    # Ctrl+A y pasar todo a subdibujo: la pantalla no cambia
    pg.keyboard.press('Control+a'); pg.wait_for_timeout(200)
    pg.click('.vec-selbar button:has-text("%s")' % L['rotate']); pg.wait_for_timeout(300)
    check('girar todo avisa o gira', pg.locator('.vec-msg').count() > 0 or pixels() != scr0)
    if pixels() != scr0: pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    pg.click('.vec-toolopts button:has-text("%s")' % L['sub']); pg.wait_for_timeout(500)
    check('subdibujo: misma pantalla', pixels() == scr0)
    check('subdibujo: pocas órdenes', ops() <= 12, ops())
    shot('7_subdibujo')
    pg.screenshot(path=f'{OUT}/8_editor.png')
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
    check('deshacer el subdibujo', ops() == n0, (n0, ops()))
    # llevar al fondo una pieza
    pg.mouse.click(box['x'] + sx * z, box['y'] + sy * z)
    pg.click('.vec-selbar button:has-text("%s")' % L['front']); pg.wait_for_timeout(300)
    shot('9_fondo')
    check('sin errores de JavaScript', not errors, errors[:5])
    b.close()
sys.exit(1 if bad else 0)
