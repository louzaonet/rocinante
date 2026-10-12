#!/bin/sh
# Descarga y compila DRC (DAAD Reborn Compiler) en .drc/ para las pruebas.
# DRC es GPL y no forma parte de Rocinante: solo se usa en local para compilar
# los .dsf de test/ y obtener las transcripciones de referencia.
# Necesita git, fpc (Free Pascal, con plex) y php.
set -e
DIR=${DRC_DIR:-$(dirname "$0")/../.drc}
for t in git fpc plex php; do
  command -v $t >/dev/null || { echo "Falta $t"; exit 1; }
done
if [ ! -d "$DIR/src" ]; then
  git clone --depth 1 https://github.com/daad-adventure-writer/DRC.git "$DIR"
fi
cd "$DIR/src"
plex DSF.l lexer.pas >/dev/null
fpc -Mobjfpc -O2 drf.pas >/dev/null
fpc -Mobjfpc -O2 daadmaker.pas >/dev/null
cp drf daadmaker drb.php ..
echo "DRC listo en $(cd .. && pwd)"
