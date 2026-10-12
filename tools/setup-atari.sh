#!/bin/sh
# Deja en .roms/atari/ EmuTOS, el sistema operativo libre (GPL) del Atari ST,
# para probar en Hatari las exportaciones de Atari ST (test/st.py). EmuTOS no
# forma parte de Rocinante; se descarga de su página en SourceForge
# (emutos.sourceforge.io).
# Hace falta Hatari y un servidor X virtual: apt install hatari xvfb
set -e
VER=1.4
DIR=$(dirname "$0")/../.roms/atari
mkdir -p "$DIR"
TMP=$(mktemp -d)
curl -sSfL -o "$TMP/emutos.zip" "https://sourceforge.net/projects/emutos/files/emutos/$VER/emutos-256k-$VER.zip/download"
unzip -q -o -j "$TMP/emutos.zip" "emutos-256k-$VER/etos256es.img" "emutos-256k-$VER/etos256us.img" -d "$DIR"
rm -rf "$TMP"
command -v hatari >/dev/null || echo "Falta Hatari (apt install hatari)"
command -v xvfb-run >/dev/null || echo "Falta Xvfb (apt install xvfb)"
echo "EmuTOS en $(cd "$DIR" && pwd)"
