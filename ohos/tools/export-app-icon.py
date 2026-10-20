#!/usr/bin/env python3
"""Render the editable icon and check its checked-in OHOS exports.

Requires Inkscape 1.4+ and Pillow. This tool does not download dependencies.
Run from any directory; --check writes only to a temporary directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageDraw, ImageFont

OHOS = Path(__file__).resolve().parents[1]
SOURCE = OHOS / 'design/app-icon/icon.svg'
MEDIA = OHOS / 'AppScope/resources/base/media'
DESIGN = SOURCE.parent
SIZE = 1024
# Project QA margins, not a platform-mandated safe zone. The old 400px radius
# unnecessarily reduced the visible artwork to about 54% of the canvas.
SAFE_RADIUS = 500
CLIP_RADIUS = 508
VISIBLE_ALPHA = 64
ADAPTIVE_OFFSET = 8
SVG = '{http://www.w3.org/2000/svg}'
EXPORTS = ('app_icon.png', 'app_icon_foreground.png', 'app_icon_background.png')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def render(source: Path, target: Path, temp: Path) -> Image.Image:
    env = dict(os.environ, INKSCAPE_PROFILE_DIR=str(temp / 'profile'),
               XDG_CACHE_HOME=str(temp / 'cache'))
    result = subprocess.run(['inkscape', str(source), '--export-area-page',
                             '--export-width=1024', '--export-height=1024',
                             f'--export-filename={target}'], env=env,
                            text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    with Image.open(target) as image:
        return image.convert('RGBA')


def layers(temp: Path) -> dict[str, Image.Image]:
    images = {}
    for keep in ('background', 'foreground', 'unclipped_foreground'):
        root = ET.parse(SOURCE).getroot()
        for child in list(root):
            expected = 'foreground' if keep == 'unclipped_foreground' else keep
            if child.tag == SVG + 'g' and child.get('id') != expected:
                root.remove(child)
            elif keep == 'unclipped_foreground' and child.get('id') == 'foreground':
                child.attrib.pop('clip-path', None)
        for element in root.iter(SVG + 'image'):
            for attribute in ('href', '{http://www.w3.org/1999/xlink}href'):
                if attribute in element.attrib:
                    element.set(attribute, (SOURCE.parent / element.get(attribute)).resolve().as_uri())
        local = temp / f'{keep}.svg'
        ET.ElementTree(root).write(local, encoding='utf-8', xml_declaration=True)
        images[keep] = render(local, temp / f'{keep}.png', temp)
    return images


def validate(images: dict[str, Image.Image]) -> None:
    foreground, background = images['foreground'], images['background']
    assert foreground.size == background.size == (SIZE, SIZE)
    assert background.getchannel('A').getextrema() == (255, 255), 'Background must be opaque'
    alpha = foreground.getchannel('A')
    low, high = alpha.getextrema()
    assert low == 0 and high >= 254, 'Foreground must have real transparency and opaque artwork'
    assert alpha.getbbox() is not None, 'Foreground must not be empty'
    unclipped = images['unclipped_foreground'].getchannel('A')
    for y in range(SIZE):
        for x in range(SIZE):
            original = unclipped.getpixel((x, y))
            if original >= VISIBLE_ALPHA:
                assert (x - 512) ** 2 + (y - 512) ** 2 <= SAFE_RADIUS ** 2, f'Visible artwork outside QA circle: {x}, {y}'
                # Inkscape clipping can round alpha by 1–2 levels; it must not
                # conceal an oversized source behind the safety clip.
                assert original - alpha.getpixel((x, y)) <= 8, f'Clipped visible artwork: {x}, {y}'
    # Full-canvas circular masks and small translations preserve visible art.
    # Larger device-specific launcher transforms still require device testing.
    visible = alpha.point(lambda value: 255 if value >= VISIBLE_ALPHA else 0)
    for dx, dy in ((0, 0), (ADAPTIVE_OFFSET, 0), (-ADAPTIVE_OFFSET, 0), (0, ADAPTIVE_OFFSET), (0, -ADAPTIVE_OFFSET)):
        shifted = Image.new('L', (SIZE, SIZE))
        shifted.paste(visible, (dx, dy))
        circle = Image.new('L', (SIZE, SIZE))
        ImageDraw.Draw(circle).ellipse((0, 0, SIZE - 1, SIZE - 1), fill=255)
        assert ImageChops.subtract(shifted, circle).getbbox() is None, 'Adaptive mask clips the mark'


def font(size: int):
    try:
        return ImageFont.truetype('DejaVuSans.ttf', size)
    except OSError:
        return ImageFont.load_default(size=size)


def preview(images: dict[str, Image.Image], target: Path) -> None:
    """A QA contact sheet, not a simulated device screenshot."""
    composite = Image.alpha_composite(images['background'], images['foreground'])
    sheet = Image.new('RGB', (1600, 1060), '#F7F6F2')
    draw = ImageDraw.Draw(sheet)
    draw.text((64, 48), 'UPRIGHT PLAYER + HARDWARE', fill='#263238', font=font(34))
    draw.text((64, 96), 'MultiFunPlayer / OHOS icon', fill='#68726C', font=font(20))
    large = composite.resize((600, 600), Image.Resampling.LANCZOS)
    mask = Image.new('L', (600, 600))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 599, 599), radius=136, fill=255)
    sheet.paste(large, (64, 164), mask)
    draw.text((64, 792), 'Primary mark · rounded-square mask', fill='#263238', font=font(20))
    draw.text((770, 164), 'NATIVE SIZE CHECK', fill='#68726C', font=font(18))
    x = 770
    for size in (16, 24, 32, 48, 64, 96, 128):
        tile = composite.resize((size, size), Image.Resampling.LANCZOS)
        sheet.paste(tile, (x, 230 + (128-size)//2))
        draw.text((x, 378), str(size), fill='#68726C', font=font(16))
        x += size + 32
    draw.text((770, 452), 'MASK + SURFACE CHECK', fill='#68726C', font=font(18))
    for i, (color, kind) in enumerate((('#FFFFFF', 'Circle'), ('#17282D', 'Squircle'), ('#DDE7E0', 'Rounded'))):
        x, y, size = 770+i*248, 510, 192
        draw.rounded_rectangle((x-14,y-14,x+206,y+250), radius=20, fill=color)
        mask = Image.new('L', (size,size)); painter = ImageDraw.Draw(mask)
        if kind == 'Circle':
            painter.ellipse((0,0,size-1,size-1), fill=255)
        else:
            painter.rounded_rectangle((0,0,size-1,size-1), radius=48 if kind=='Squircle' else 32, fill=255)
        sheet.paste(composite.resize((size,size),Image.Resampling.LANCZOS), (x,y), mask)
        draw.text((x+8,y+210),kind,fill='#F4F5EF' if i==1 else '#435249',font=font(18))
    draw.text((64, 906), 'Upright player + connected hardware. Warm pixel mascot, clear play + diagonal shadow.', fill='#435249', font=font(21))
    draw.text((64, 954), 'Larger family-scale artwork · editable SVG layout + bitmap art · 1024 px PNG', fill='#68726C', font=font(19))
    draw.text((64, 1001), 'Static resource QA. Native HarmonyOS launcher/device rendering still requires device validation.', fill='#68726C', font=font(17))
    sheet.save(target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify exports without modifying tracked files')
    parser.add_argument('--preview', type=Path, help='Write an optional QA contact sheet')
    args = parser.parse_args()
    if not shutil.which('inkscape'):
        parser.error('Inkscape is required; install it from its official source before exporting')
    with tempfile.TemporaryDirectory(prefix='mfp-icon-') as temporary:
        temp = Path(temporary)
        images = layers(temp)
        validate(images)
        composite = Image.alpha_composite(images['background'], images['foreground'])
        exports = {'app_icon.png': composite.convert('RGB'),
                   'app_icon_foreground.png': images['foreground'],
                   'app_icon_background.png': images['background'].convert('RGB')}
        metadata = {'source': 'icon.svg', 'source_sha256': digest(SOURCE.read_bytes()),
                    'artwork': 'foreground-art.png',
                    'artwork_sha256': digest((DESIGN/'foreground-art.png').read_bytes()),
                    'canvas': [SIZE, SIZE], 'safe_circle': {'cx':512, 'cy':512, 'radius':SAFE_RADIUS},
                    'clip_radius': CLIP_RADIUS, 'visible_alpha_threshold': VISIBLE_ALPHA,
                    'tested_translation_px': ADAPTIVE_OFFSET,
                    'exports': {}}
        for name, image in exports.items():
            output = temp / name
            image.save(output, optimize=True)
            metadata['exports'][name] = {'sha256':digest(output.read_bytes()), 'mode':image.mode}
            if args.check:
                assert (MEDIA/name).read_bytes() == output.read_bytes(), f'Stale export: {name}'
            else:
                shutil.copyfile(output, MEDIA/name)
        manifest = json.dumps(metadata, indent=2) + '\n'
        if args.check:
            assert (DESIGN/'exports.json').read_text() == manifest, 'Stale export manifest'
        else:
            (DESIGN/'exports.json').write_text(manifest)
        if args.preview:
            args.preview.parent.mkdir(parents=True, exist_ok=True)
            preview(images, args.preview)
    print('PASS: source/export parity, 1024px PNGs, alpha, safe circle and adaptive mask checks')


if __name__ == '__main__':
    main()
