"""Rebuild the PWA placeholder icons with Pillow."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/msjhbd.ttc"),
    Path("C:/Windows/Fonts/msjh.ttc"),
]


def font_for(size: int):
    for font_path in FONT_CANDIDATES:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size=size, index=0)
    return ImageFont.load_default()


def render(size: int, filename: str):
    scale = size / 512
    image = Image.new("RGB", (size, size), "#f7f1e7")
    draw = ImageDraw.Draw(image)
    margin = round(92 * scale)
    draw.ellipse((margin, margin, size - margin, size - margin), fill="#4b2d4f")

    font = font_for(max(12, round(104 * scale)))
    text = "芋桑"
    bounds = draw.textbbox((0, 0), text, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.text(
        ((size - width) / 2, (size - height) / 2 - round(18 * scale)),
        text,
        font=font,
        fill="#fffdf8",
    )

    y = round(360 * scale)
    draw.arc(
        (round(190 * scale), round(316 * scale), round(322 * scale), round(382 * scale)),
        start=25,
        end=155,
        fill="#d7c2d7",
        width=max(3, round(14 * scale)),
    )
    image.save(ICONS / filename, optimize=True)


if __name__ == "__main__":
    ICONS.mkdir(exist_ok=True)
    render(192, "icon-192.png")
    render(512, "icon-512.png")
    render(180, "apple-touch-icon.png")
