#!/bin/sh
# Deja en .roms/ las ROM del Amstrad CPC 6128 y 464 para probar en MAME las
# exportaciones de CPC (test/cpc.py). Las ROM son de Amstrad, que permite
# distribuirlas con emuladores; no forman parte de Rocinante. Se toman de
# Caprice32 (github.com/ColinPitrat/caprice32).
set -e
DIR=$(dirname "$0")/../.roms
mkdir -p "$DIR/cpc6128" "$DIR/cpc464"
URL=https://raw.githubusercontent.com/ColinPitrat/caprice32/master/rom
curl -sSfL -o "$DIR/cpc6128/cpc6128.rom" $URL/cpc6128.rom
curl -sSfL -o "$DIR/cpc6128/cpcados.rom" $URL/amsdos.rom
curl -sSfL -o "$DIR/cpc464/cpc464.rom" $URL/cpc464.rom
command -v mame >/dev/null || [ -x /usr/games/mame ] || echo "Falta MAME (apt install mame)"
echo "ROM del CPC en $(cd "$DIR" && pwd)"
