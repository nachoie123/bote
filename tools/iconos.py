#!/usr/bin/env python3
"""Genera los iconos PNG de Bote sin instalar nada: solo la stdlib.

Dibuja una ficha de póker sobre tapete verde. El PNG se escribe a mano con
`zlib`, que es todo lo que hace falta para una imagen plana como esta.

    python3 tools/iconos.py        -> iconos/icono-{180,192,512}.png
"""
import math
import os
import struct
import zlib

AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(os.path.dirname(AQUI), "iconos")

TAPETE = (14, 74, 51)      # verde de mesa
FICHA = (241, 245, 243)    # blanco hueso
ACENTO = (34, 197, 94)     # el verde de la app

MUESTREO = 3               # supermuestreo: 3x3 por píxel para que no salga con dientes


def color_en(u, v):
    """Color de la imagen en coordenadas 0..1. La ficha va centrada."""
    dx, dy = u - 0.5, v - 0.5
    r = math.hypot(dx, dy)

    if r > 0.40:
        return TAPETE
    if r > 0.315:
        # Canto de la ficha: seis muescas repartidas, como las de verdad.
        ang = math.degrees(math.atan2(dy, dx)) % 60.0
        return ACENTO if ang < 30.0 else FICHA
    if 0.225 < r <= 0.25:
        return ACENTO          # aro interior
    return FICHA


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
    for tam in (180, 192, 512):
        ruta = os.path.join(DESTINO, f"icono-{tam}.png")
        escribir_png(ruta, render(tam), tam)
        print(f"{ruta}  ({os.path.getsize(ruta)} bytes)")


if __name__ == "__main__":
    main()
