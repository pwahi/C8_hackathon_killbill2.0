"""Prepare reviewed commercial-table crops; never overwrite source evidence."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "private" / "masked"


def main():
    output = ROOT / "benchmark-crops"
    output.mkdir(exist_ok=True)
    with Image.open(ROOT / "Participant A" / "WhatsApp Image 2026-10-17 at 18.19.21.jpeg") as image:
        # Reviewed 712x966 page: retain charge rows and erase both phone labels.
        if image.size != (712, 966):
            raise ValueError("Source A dimensions changed; review crop coordinates")
        crop = image.convert("RGB").crop((32, 130, 692, 400))
        draw = ImageDraw.Draw(crop)
        draw.rectangle((7, 65, 98, 77), fill="white")
        draw.rectangle((7, 201, 98, 214), fill="white")
        crop.save(output / "A-charge-table.png")
    with Image.open(ROOT / "PArticipant D" / "WhatsApp Image 2026-10-18 at 11.33.05.jpeg") as image:
        if image.size != (955, 2048):
            raise ValueError("Source D dimensions changed; review crop coordinates")
        image.convert("RGB").crop((55, 370, 900, 1290)).save(output / "D-charge-table.png")
    print("Prepared A and D crops locally; source files unchanged. Inspect before sending.")


if __name__ == "__main__":
    main()
