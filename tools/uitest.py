"""Recorre el editor en Chromium: paneles, prueba de juego, exportaciones e
importaciones, con la interfaz en castellano o en inglés.
Uso: uitest.py [es|en] [juego de DAAD o PAW: .z80, .sna, .tap, .tzx, .dsk, .st, .adf, .img, .zip o .rom]"""
import sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LANG = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ('es', 'en') else 'es'
PAW = next((a for a in sys.argv[1:] if a.lower().endswith(('.z80', '.sna', '.tap', '.tzx', '.dsk', '.st', '.adf', '.img', '.zip', '.rom'))), None)
OUT = '/tmp/ui_' + LANG; os.makedirs(OUT, exist_ok=True)
L = {
    'es': dict(new='Juego nuevo en castellano', start='Empezar', project='Proyecto', export='Exportar', paw='DAAD o PAW', imp='Importar',
               cmds=['mirar', 'n', 'coger linterna', 'i']),
    'en': dict(new='New game in English', start='Start', project='Project', export='Export', paw='DAAD or PAW', imp='Import',
               cmds=['look', 'n', 'get torch', 'i']),
}[LANG]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1360, 'height': 860}, accept_downloads=True)
    ctx.add_init_script("try { localStorage.setItem('rocinante.idioma', '%s') } catch (e) {}" % LANG)
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('file://' + ROOT + '/dist/rocinante.html')
    pg.wait_for_timeout(800)
    # juego nuevo con la plantilla del idioma
    pg.click('.menus >> text=' + L['project'])
    pg.click('.menu-list li:has-text("%s")' % L['new'])
    pg.click('.dialog button:has-text("%s")' % L['start'])
    pg.wait_for_timeout(500)
    for k in ['juego', 'mapa', 'localidades', 'objetos', 'vocabulario', 'mensajes', 'sistema', 'procesos', 'dibujos']:
        pg.click(f'.side a[href="#{k}"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{k}.png')
    pg.click('.side a[href="#probar"]'); pg.wait_for_timeout(800)
    pg.click('.zx-screen')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    for cmd in L['cmds']:
        pg.keyboard.type(cmd); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/probar.png')
    # Exportar: plataforma (None = opción suelta) y clave de la opción
    EXPORTS = [(None, 'web')] + [('ZX Spectrum', k) for k in ('z128', 't128', 'x128', 'w128', 'z48', 't48', 'x48', 'w48', 'ddb')] \
        + [('Amstrad CPC', k) for k in ('cpc-dsk', 'cpc-cdt', 'cpc-wav', 'cpc-ddb')] \
        + [('Commodore 64', k) for k in ('c64-d64', 'c64-ddb')] \
        + [('MSX', k) for k in ('msx-rom', 'msx-ddb')] \
        + [('PC (DOS)', k) for k in ('dos-zip', 'dos-img', 'dos-ddb')] \
        + [('Atari ST', k) for k in ('st-st', 'st-ddb')] \
        + [('Amiga', k) for k in ('amiga-adf', 'amiga-ddb')]
    for group, what in EXPORTS:
        pg.click('.menus >> text=' + L['export'])
        if group:
            pg.click('.menu-list li.group:has-text("%s")' % group)
            if what == EXPORTS[[g for g, _ in EXPORTS].index(group)][1]:
                pg.screenshot(path=f'{OUT}/menu_{group.split()[-1].lower()}.png')
        with pg.expect_download() as d:
            pg.click('.menu-list li[data-k="%s"]' % what)
        d.value.save_as(f'{OUT}/export_{what}_' + d.value.suggested_filename)
        pg.wait_for_timeout(200)
    if PAW:
        pg.click('.menus >> text=' + L['project'])
        with pg.expect_file_chooser() as fc:
            pg.click('.menu-list li:has-text("%s")' % L['paw'])
        fc.value.set_files(PAW)
        pg.wait_for_timeout(1500)
        # un disco con varias partes pregunta cuál importar: la primera
        btn = pg.locator('.dialog button:has-text("%s")' % L['imp'])
        if btn.count(): btn.first.click(); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/paw_juego.png')
        pg.click('.side a[href="#mapa"]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/paw_mapa.png')
        pg.click('.side a[href="#probar"]'); pg.wait_for_timeout(1000)
        pg.click('.zx-screen'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        for i in range(3): pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/paw_probar.png')
    b.close()
print('errores:', errors[:20])
print(sorted(os.listdir(OUT)))
