#!/bin/sh
# Compila un .DSF con DRC (solo como herramienta de pruebas, no se distribuye).
# Uso: dsfc.sh fichero.dsf [es|en]  -> fichero.ddb
# DRC se busca en $DRC_DIR o en .drc/ (lo deja ahí tools/setup-drc.sh).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
DRC=${DRC_DIR:-$HERE/../.drc}
[ -x "$DRC/drf" ] || { echo "No encuentro DRC en $DRC: ejecuta tools/setup-drc.sh"; exit 1; }
f=$(readlink -f "$1"); d=$(dirname "$f"); n=$(basename "$f" .dsf)
cd "$d"
TMP=$(mktemp -d)
iconv -f utf8 -t latin1 "$n.dsf" > "$n.l1.dsf"
"$DRC/drf" zx 48k "$n.l1.dsf" "$n.json" >"$TMP/drf.log" 2>&1 || { cat "$TMP/drf.log"; exit 1; }
php "$DRC/drb.php" zx 48k "${2:-es}" "$n.json" "$n.ddb" >"$TMP/drb.log" 2>&1 || { cat "$TMP/drb.log"; exit 1; }
rm -rf "$n.json" "$n.l1.dsf" "$TMP"
