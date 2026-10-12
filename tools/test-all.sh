#!/bin/sh
# Todas las pruebas. Las de JavaScript solo necesitan node; las del emulador
# necesitan Python 3 con skoolkit (pip install skoolkit) y comparan con los
# intérpretes DAAD reales que van en ref/. Las del CPC necesitan además MAME,
# Pillow y las ROM (tools/setup-cpc.sh); las del C64, VICE, Xvfb, Pillow y las
# ROM (tools/setup-c64.sh); las del Atari ST, Hatari, Xvfb, Pillow y EmuTOS
# (tools/setup-atari.sh); las del PC, DOSBox, Xvfb, xdotool y Pillow (no
# necesitan ROM); las del MSX, openMSX, C-BIOS, Xvfb y Pillow (C-BIOS es libre:
# apt install openmsx cbios); las del Amiga, FS-UAE, Xvfb, xdotool, Pillow y el Kickstart
# 1.3 en .roms/amiga/kick13.rom (de Amiga Forever, por ejemplo); las de los
# juegos clásicos, los juegos en .clasicos/ (no van con Rocinante). Si faltan,
# se saltan.
# Uso: tools/test-all.sh [--solo-js]
set -e
cd "$(dirname "$0")/.."
echo "== JavaScript"
node test/run.mjs
node test/screens.mjs
node test/roundtrip.mjs >/dev/null
node test/project.mjs
node test/vecops.mjs >/dev/null
node test/pieces.mjs >/dev/null
node test/taperead.mjs >/dev/null
node tools/i18n-check.mjs >/dev/null
node test/export128.mjs >/dev/null
node test/mksnap.mjs >/dev/null
node test/template.mjs >/dev/null
node test/pictures.mjs >/dev/null
node test/tapes.mjs
node test/vector.mjs
node test/cpc.mjs >/dev/null
node test/c64.mjs >/dev/null
node test/m68k.mjs >/dev/null
node test/dos.mjs >/dev/null
node test/msx.mjs >/dev/null
node test/classic.mjs >/dev/null
node test/import16.mjs >/dev/null
[ "$1" = "--solo-js" ] && exit 0
python3 -c "import skoolkit" 2>/dev/null || { echo "Falta skoolkit: pip install skoolkit"; exit 1; }
echo "== Emulador (intérpretes DS48IS y DS48IE)"
python3 test/roundtrip.py
python3 test/run128.py
python3 test/runsnap.py
python3 test/template.py
python3 test/pictures.py
python3 test/tapes.py
python3 test/vector.py
echo "== Amstrad CPC en MAME (intérpretes DCPCIS y DCPCIE)"
python3 test/cpc.py
echo "== Commodore 64 en VICE (intérpretes SDI64 y EDI64)"
python3 test/c64.py
echo "== MSX en openMSX con C-BIOS (intérpretes MSXSDI y MSXEDI)"
python3 test/msx.py
echo "== Juegos clásicos de .clasicos/ (intérprete original de DAAD 1, DAAD 2 y motor JS)"
python3 test/classic.py
echo "== PC en DOSBox (intérpretes INTSM1 e INTEM1)"
python3 test/dos.py
echo "== Atari ST en Hatari con EmuTOS (intérpretes SDI1 y EDI1)"
python3 test/st.py
echo "== Amiga en FS-UAE con Kickstart 1.3 (intérpretes sdi1 y edi1)"
python3 test/amiga.py
echo "Todo bien."
