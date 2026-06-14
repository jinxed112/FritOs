#!/usr/bin/env python3
"""Décode un flux STAR raster bitmap → PNG."""
import sys
from pathlib import Path
from PIL import Image

def decode_star_raster(data: bytes) -> Image.Image:
    """
    Format STAR Line Mode raster :
      - Header : ESC * r A     (1B 2A 72 41)  enter raster
                 ESC * r P 0   (1B 2A 72 50 30 00)  set page mode
                 ESC * r E 1 0 (1B 2A 72 45 31 00)
      - Pour chaque ligne pixel :
          b <n1>     ou      b <n1> <n2>      suivi de <data> bytes
          n1 = nb bytes pixels (low byte si 2 bytes) ; 1 byte = 8 pixels horiz
      - Footer : ESC * r B  (1B 2A 72 42)  exit raster
    On scanne le flux et on extrait chaque ligne. width inféré de la 1ère ligne.
    """
    i = 0
    n = len(data)
    rows = []   # list of bytes (each row of pixel data)
    width_bytes = None

    while i < n:
        b = data[i]
        # ESC * r X
        if b == 0x1B and i + 2 < n and data[i+1] == 0x2A and data[i+2] == 0x72:
            cmd = data[i+3] if i+3 < n else None
            if cmd == 0x42:  # 'B' = exit raster
                i += 4
                continue
            elif cmd in (0x41,):  # 'A' = enter raster, 1 byte arg already used
                i += 4
                continue
            elif cmd in (0x50, 0x45):  # 'P','E' = config, 2 bytes args + NUL
                i += 6
                continue
            else:
                i += 4
                continue
        elif b == 0x1B:
            i += 1
            continue
        elif b == 0x62:  # 'b' raster line marker
            # essai single-byte length
            if i + 1 >= n:
                break
            length = data[i+1]
            i += 2
            if i + length > n:
                length = n - i
            row = data[i:i+length]
            if width_bytes is None and len(row) > 0:
                width_bytes = len(row)
            rows.append(row)
            i += length
        else:
            # bytes inattendus (peut être un autre type de cmd) : skip
            i += 1

    if not rows or not width_bytes:
        raise RuntimeError(f"Aucune ligne raster trouvée (parsé {len(rows)} rows)")

    width_px = width_bytes * 8
    height_px = len(rows)
    img = Image.new('1', (width_px, height_px), 1)  # 1 = white background
    px = img.load()

    for y, row in enumerate(rows):
        for x_byte in range(min(len(row), width_bytes)):
            byte = row[x_byte]
            for bit in range(8):
                # MSB first
                if byte & (0x80 >> bit):
                    px[x_byte * 8 + bit, y] = 0  # 0 = black

    return img

def main():
    if len(sys.argv) < 2:
        print("Usage: decode_star.py <input.bin> [<output.png>]")
        sys.exit(1)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".png")
    data = src.read_bytes()
    print(f"Input: {src} ({len(data)} bytes)")
    img = decode_star_raster(data)
    print(f"Decoded: {img.size[0]} × {img.size[1]} px ({img.size[1]/8:.0f} mm @ 200dpi)")
    img.save(dst)
    print(f"Output: {dst}")

if __name__ == "__main__":
    main()
