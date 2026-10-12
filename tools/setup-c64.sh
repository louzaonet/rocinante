#!/bin/sh
# Deja en .roms/vice/ las ROM del Commodore 64 y de su unidad 1541 para probar
# en VICE las exportaciones de C64 (test/c64.py). Las ROM son de Commodore y no
# forman parte de Rocinante; se toman de la réplica en GitHub de VICE
# (github.com/VICE-Team/svn-mirror), que las distribuye con el emulador.
# Hace falta VICE y un servidor X virtual: apt install vice xvfb
set -e
# (con la misma estructura que usa VICE: vice/C64 y vice/DRIVES)
DIR=$(dirname "$0")/../.roms/vice
mkdir -p "$DIR/C64" "$DIR/DRIVES"
URL=https://raw.githubusercontent.com/VICE-Team/svn-mirror/main/vice/data
for f in C64/kernal-901227-03.bin C64/basic-901226-01.bin C64/chargen-901225-01.bin DRIVES/dos1541-325302-01+901229-05.bin; do
  curl -sSfL -o "$DIR/$f" "$URL/$f"
done
command -v x64sc >/dev/null || echo "Falta VICE (apt install vice)"
command -v xvfb-run >/dev/null || echo "Falta Xvfb (apt install xvfb)"
echo "ROM del C64 en $(cd "$DIR" && pwd)"
