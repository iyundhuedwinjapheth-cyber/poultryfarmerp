from pathlib import Path
from PIL import Image

root = Path('.')
icons = [
    ('logo1.png', 'public/icons/icon-192x192.png', (192, 192)),
    ('logo1.png', 'public/icons/icon-512x512.png', (512, 512)),
    ('logo2.png', 'public/icons/maskable-icon-512x512.png', (512, 512)),
    ('logo2.png', 'public/icons/apple-touch-icon.png', (180, 180)),
]

output_dir = root / 'public' / 'icons'
output_dir.mkdir(parents=True, exist_ok=True)

for src, dst, size in icons:
    src_path = root / src
    dst_path = root / dst
    with Image.open(src_path) as img:
        img = img.convert('RGBA')
        resized = img.resize(size, Image.Resampling.LANCZOS)
        resized.save(dst_path, format='PNG', optimize=True)
        print(f'created {dst_path} {resized.size}')
