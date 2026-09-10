"""Generate the two test images used by the recognition unit tests."""
import pathlib
import piexif
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "test" / "fixtures"
LAT, LON = 35.6586, 139.7454  # Tokyo Tower


def _dms(value):
    deg = int(value)
    minutes = int((value - deg) * 60)
    sec = round((value - deg - minutes / 60) * 3600 * 100)
    return ((deg, 1), (minutes, 1), (sec, 100))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (64, 64), (90, 110, 130))

    img.save(OUT / "nogps.jpg", "JPEG", quality=80)

    gps_ifd = {
        piexif.GPSIFD.GPSLatitudeRef: "N",
        piexif.GPSIFD.GPSLatitude: _dms(LAT),
        piexif.GPSIFD.GPSLongitudeRef: "E",
        piexif.GPSIFD.GPSLongitude: _dms(LON),
    }
    exif_bytes = piexif.dump({"GPS": gps_ifd})
    img.save(OUT / "gps.jpg", "JPEG", quality=80, exif=exif_bytes)
    print(f"wrote {OUT/'gps.jpg'} and {OUT/'nogps.jpg'}")


if __name__ == "__main__":
    main()
