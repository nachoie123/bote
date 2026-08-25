#!/usr/bin/env python3
"""Genera el logo y los iconos de Bote sin instalar nada: solo la stdlib.

La marca es una ficha de póker con la «B» en el centro: canto blanco con seis
muescas verdes, tapa blanca y disco central verde. Los colores son los de la
app (`css/app.css`), para que el icono de la pantalla de inicio y la interfaz
se lean como la misma cosa.

El PNG se escribe a mano con `zlib`, que es todo lo que hace falta para una
imagen plana como esta.

El vector de la marca vive aparte, en `assets/logo.svg`, con esta misma
geometría: si se toca una, hay que tocar la otra.

    python3 tools/iconos.py        -> iconos/icono-{32,180,192,512}.png
"""
import math
import os
import struct
import zlib

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DESTINO = os.path.join(RAIZ, "iconos")

FONDO = (11, 15, 13)       # --fondo, el negro de la app
FICHA = (241, 245, 243)    # --texto, blanco hueso
ACENTO = (34, 197, 94)     # --verde

MUESTREO = 3               # supermuestreo: 3x3 por píxel para que no salga con dientes

# --- La «B», construida con un palo y dos panzas elípticas -------------------
# Coordenadas relativas al centro de la ficha. Alto 0,26 y ancho 0,16: las
# proporciones de una B de verdad, que es más alta que ancha.
ALTO = 0.175               # media altura
PALO_DER, PALO_IZQ = -0.047, -0.111
PANZAS = (
    # (centro y, radio x, radio y, radio x interior, radio y interior).
    # El radio x se recorta más que el y: así el costado sale grueso y la
    # barra horizontal fina, que es como se dibuja una letra.
    (-0.092, 0.142, 0.083, 0.084, 0.047),   # la de arriba, más pequeña
    (+0.083, 0.155, 0.092, 0.093, 0.054),   # la de abajo, como en cualquier B
)


def en_la_b(x, y):
    """¿Cae este punto dentro de la letra?"""
    if PALO_IZQ <= x <= PALO_DER and -ALTO <= y <= ALTO:
        return True
    if x < PALO_DER:
        return False
    for cy, rx, ry, rxi, ryi in PANZAS:
        dx, dy = x - PALO_DER, y - cy
        if math.hypot(dx / rx, dy / ry) <= 1.0 and math.hypot(dx / rxi, dy / ryi) >= 1.0:
            return True
    return False


def color_en(u, v):
    """Color de la imagen en coordenadas 0..1. La ficha va centrada."""
    dx, dy = u - 0.5, v - 0.5
    r = math.hypot(dx, dy)

    if r > 0.475:
        return FONDO
    if r > 0.385:
        # Canto de la ficha: seis muescas repartidas, como las de verdad.
        ang = math.degrees(math.atan2(dy, dx)) % 60.0
        return ACENTO if ang < 30.0 else FICHA
    if r > 0.315:
        return FICHA               # tapa de la ficha
    if r > 0.285:
        return FONDO               # aro que separa la tapa del disco
    return FONDO if en_la_b(dx, dy) else ACENTO


def render(tam):
    """Devuelve las filas RGB de un icono de tam x tam píxeles."""
    n = MUESTREO
    filas = []
    for y in range(tam):
        fila = bytearray()
        for x in range(tam):
            acc = [0, 0, 0]
            for sy in range(n):
                for sx in range(n):
                    u = (x + (sx + 0.5) / n) / tam
                    v = (y + (sy + 0.5) / n) / tam
                    c = color_en(u, v)
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
            total = n * n
            fila += bytes(v // total for v in acc)
        filas.append(bytes(fila))
    return filas


def escribir_png(ruta, filas, tam):
    """PNG RGB de 8 bits, sin filtro por línea (tipo 0)."""
    crudo = b"".join(b"\x00" + f for f in filas)

    def trozo(tipo, datos):
        return (struct.pack(">I", len(datos)) + tipo + datos
                + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + trozo(b"IHDR", struct.pack(">IIBBBBB", tam, tam, 8, 2, 0, 0, 0))
           + trozo(b"IDAT", zlib.compress(crudo, 9))
           + trozo(b"IEND", b""))
    with open(ruta, "wb") as f:
        f.write(png)


def main():
    os.makedirs(DESTINO, exist_ok=True)
    for tam in (32, 180, 192, 512):
        ruta = os.path.join(DESTINO, f"icono-{tam}.png")
        escribir_png(ruta, render(tam), tam)
        print(f"{ruta}  ({os.path.getsize(ruta)} bytes)")


if __name__ == "__main__":
    main()
