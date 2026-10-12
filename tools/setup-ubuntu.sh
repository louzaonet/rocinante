#!/bin/sh
# Monta el entorno de pruebas de Rocinante en Ubuntu 24.04 o Debian 12
# (x86-64): paquetes del sistema, entorno de Python, dependencias de npm y las
# ROM que se pueden descargar. Lo que no se puede automatizar (el Kickstart del
# Amiga, los juegos clásicos) se explica en docs/pruebas/LEEME.md.
#
# Uso: tools/setup-ubuntu.sh [--sin-apt]
#   --sin-apt  no instala paquetes del sistema (ya están, o no hay sudo)
#
# Después, para pasar las pruebas:
#   . .venv/bin/activate
#   tools/test-all.sh
set -e
cd "$(dirname "$0")/.."

if [ "$1" != "--sin-apt" ]; then
  echo "== Paquetes del sistema (pide la contraseña de sudo)"
  sudo apt-get update
  # python3-venv: el emulador de Spectrum (skoolkit) va en un entorno virtual
  # mame, vice, openmsx+cbios, dosbox, hatari, fs-uae: los emuladores de cada máquina
  # xvfb, xdotool: pantalla virtual y teclado para los emuladores con ventana
  # pasmo: solo para reensamblar z80/ (opcional)
  # unzip, curl: para descargar las ROM
  sudo apt-get install -y python3 python3-venv python3-pip \
    mame vice openmsx cbios dosbox hatari fs-uae xvfb xdotool pasmo unzip curl
  # Node: las pruebas están hechas con la versión 22; el del repositorio de
  # Ubuntu 24.04 es el 18. Se instala el 22 de NodeSource si no hay uno >= 20.
  if ! node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)' 2>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi

echo "== Entorno de Python (.venv) con skoolkit y Pillow"
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet skoolkit pillow

echo "== Dependencias de npm"
npm install --silent

echo "== ROM que se pueden descargar (CPC, C64, EmuTOS)"
# (si una descarga falla, se sigue: la comprobación de abajo lo dirá)
tools/setup-cpc.sh || echo "No se han podido bajar las ROM del CPC"
tools/setup-c64.sh || echo "No se han podido bajar las ROM del C64"
tools/setup-atari.sh || echo "No se ha podido bajar EmuTOS"

echo
echo "== Comprobación"
ok=1
for p in node npm mame x64sc openmsx dosbox hatari fs-uae xvfb-run Xvfb xdotool; do
  if command -v $p >/dev/null || [ -x /usr/games/$p ]; then echo "  $p: sí"; else echo "  $p: NO"; ok=0; fi
done
python3 -c "import skoolkit, PIL" 2>/dev/null && echo "  skoolkit y Pillow: sí" || { echo "  skoolkit y Pillow: NO"; ok=0; }
[ -f .roms/cpc6128/cpc6128.rom ] && echo "  ROM del CPC: sí" || { echo "  ROM del CPC: NO"; ok=0; }
[ -f .roms/vice/C64/kernal-901227-03.bin ] && echo "  ROM del C64: sí" || { echo "  ROM del C64: NO"; ok=0; }
[ -f .roms/atari/etos256es.img ] && echo "  EmuTOS: sí" || { echo "  EmuTOS: NO"; ok=0; }
if [ -f .roms/amiga/kick13.rom ]; then echo "  Kickstart 1.3 del Amiga: sí"; else echo "  Kickstart 1.3 del Amiga: NO (ver docs/pruebas/LEEME.md; sin él se salta el Amiga)"; fi
if [ -n "$(ls .clasicos 2>/dev/null)" ]; then echo "  juegos clásicos en .clasicos/: sí"; else echo "  juegos clásicos en .clasicos/: no (esa prueba se salta)"; fi
echo
if [ $ok = 1 ]; then echo "Listo. Para pasar las pruebas:  . .venv/bin/activate && tools/test-all.sh"; else echo "Falta algo (ver arriba)."; fi
