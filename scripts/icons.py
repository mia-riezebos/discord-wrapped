"""Draw the site mark, a chat bubble tied up like a present, as the favicon and app icons in public/icons/.

Run by hand when the mark changes (python3 scripts/icons.py) and commit the output; build.py doesn't call it.
No dependencies: shapes are tested per pixel, 4 x 4 samples each, and written as PNG with zlib.
"""
import struct, zlib
from pathlib import Path

out = Path(__file__).parent.parent / 'public' / 'icons'
ACCENT, WHITE = (0x4f, 0x5b, 0xd5), (0xff, 0xff, 0xff)
# The mark on a 512 grid: bubble body, its tail, and the ribbon that crosses it.
BODY = (104, 120, 408, 336, 56)            # x0, y0, x1, y1, corner radius
TAIL = ((148, 322), (224, 322), (132, 410))
RIBBON = 36                                # band width, centred on the body

def in_round_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1): return False
    cx, cy = min(max(x, x0 + r), x1 - r), min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def in_triangle(x, y, a, b, c):
    side = lambda p, q: (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    d = side(a, b), side(b, c), side(c, a)
    return all(v >= 0 for v in d) or all(v <= 0 for v in d)

def mark_white(x, y):
    """True where the 512-grid point is white: inside the bubble and outside both ribbon bands."""
    x0, y0, x1, y1, _ = BODY
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    if abs(x - mx) <= RIBBON / 2 and y0 <= y <= y1 or abs(y - my) <= RIBBON / 2: return False
    return in_round_rect(x, y, *BODY) or in_triangle(x, y, *TAIL)

def render(size, corner, scale):
    """Pixels for one icon: `corner` rounds the background (0 is full bleed), `scale` shrinks the mark about the centre."""
    rows, n = [], 4
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            bg = fg = 0
            for sy in range(n):
                for sx in range(n):
                    x, y = (px + (sx + .5) / n) * 512 / size, (py + (sy + .5) / n) * 512 / size
                    if corner and not in_round_rect(x, y, 0, 0, 512, 512, corner): continue
                    bg += 1
                    if mark_white(256 + (x - 256) / scale, 256 + (y - 256) / scale): fg += 1
            a = bg / n / n
            colour = [round((ACCENT[i] * (bg - fg) + WHITE[i] * fg) / bg) if bg else 0 for i in range(3)]
            row += bytes(colour + [round(a * 255)])
        rows.append(bytes(row))
    return rows

def png(path, size, corner=112, scale=1):
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    raw = b''.join(render(size, corner, scale))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    print(path, path.stat().st_size, 'bytes')

def svg():
    x0, y0, x1, y1, r = BODY
    mx, my, h = (x0 + x1) / 2, (y0 + y1) / 2, RIBBON / 2
    tail = ' '.join(f'{x},{y}' for x, y in TAIL)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<rect width="512" height="512" rx="112" fill="#4f5bd5"/>'
            f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="#fff"/><polygon points="{tail}" fill="#fff"/>'
            f'<path d="M{mx - h} {y0}h{2 * h}v{y1 - y0}h{-2 * h}zM0 {my - h}h512v{2 * h}H0z" fill="#4f5bd5"/></svg>\n')

out.mkdir(exist_ok=True)
(out / 'icon.svg').write_text(svg())
png(out / 'icon-192.png', 192)
png(out / 'icon-512.png', 512)
# Maskable icons are cropped to a circle of 80 % of the width, so the mark shrinks into it on a full-bleed square.
png(out / 'icon-maskable-512.png', 512, corner=0, scale=.8)
# iOS rounds the corners itself and shows transparency as black.
png(out / 'apple-touch-icon.png', 180, corner=0)
