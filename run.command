#!/bin/bash
# Doble clic para abrir Bote en el navegador de este Mac.
# En el móvil no hace falta esto: se abre la web publicada y se añade a la
# pantalla de inicio.
cd "$(dirname "$0")" || exit 1
PUERTO=8777
python3 -m http.server "$PUERTO" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVIDOR=$!
sleep 1
open "http://localhost:$PUERTO"
echo "Bote corriendo en http://localhost:$PUERTO"
echo "Cierra esta ventana (o Ctrl+C) para pararlo."
trap 'kill $SERVIDOR 2>/dev/null' EXIT
wait $SERVIDOR
