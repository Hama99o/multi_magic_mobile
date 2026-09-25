#!/usr/bin/env python3
"""THE STORE LISTING ASSETS, AGAINST THE STORES' OWN RULES — a gate, not a taste.

Size and format rules are easy to get subtly wrong and expensive to discover
at submission: every design screenshot in docs/design/**/ours/ is 1080x2400,
ratio 2.22, and Play refuses anything over 2.0. So each rule below is quoted
from the store's page, with the date it was read, and checked against the
files in docs/store/.

GOOGLE PLAY (support.google.com/googleplay/android-developer/answer/9866151,
read 2026-09-25):
  icon             "32-bit PNG (with alpha)", "512px by 512px",
                   "Maximum file size: 1024KB"
  feature graphic  "JPEG or 24-bit PNG (no alpha)", "1024px by 500px"
  phone shots      "JPEG or 24-bit PNG (no alpha)", "Minimum dimension: 320px",
                   "Maximum dimension: 3840px", the maximum "can't be more than
                   twice as long as the minimum dimension", "a minimum of two",
                   "up to 8 ... for each supported device type"
  promotion        "at least four screenshots with minimum 1080px resolution",
                   "9:16 for portrait screenshots (minimum 1080x1920px)"

APPLE (developer.apple.com/help/app-store-connect/reference/app-information/
screenshot-specifications/, read 2026-09-25): 6.9" iPhone 1320x2868,
1290x2796 or 1260x2736; 6.5" 1284x2778 or 1242x2688; 13" iPad 2064x2752 or
2048x2732 (required: the app declares iPad support); .jpeg/.jpg/.png, "can't
include alpha channels or transparencies", 1 to 10. Checked when a folder
exists; NOTHING here can produce them (no iOS simulator on Linux).

WHAT NO PROGRAM HERE CAN CHECK, and Play forbids: notifications or a carrier
in the status bar, device frames or added text, and content that is not the
real app. And this repo's own rule: nothing of the QA account (a test
account's data, shaped by flows) and nothing of the owner's may be in a
published picture. A human looks at every shot before upload.

Exit 0 all present and valid · 1 a rule broken · 2 an asset missing.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.environ.get("STORE_DIR", os.path.join(ROOT, "docs", "store"))

PLAY_PHONE = os.path.join(STORE, "play-phone")
PLAY_ICON = os.path.join(STORE, "play-icon-512.png")
PLAY_FEATURE = os.path.join(STORE, "play-feature-1024x500.png")
APPLE_SETS = {
    "apple-iphone-6.9": {(1320, 2868), (1290, 2796), (1260, 2736)},
    "apple-iphone-6.5": {(1284, 2778), (1242, 2688)},
    "apple-ipad-13": {(2064, 2752), (2048, 2732)},
}

broken, missing, notes = [], [], []


def has_alpha(im: Image.Image) -> bool:
    """A channel, not a pixel: Play and Apple refuse the CHANNEL."""
    return im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)


def images(folder):
    return sorted(
        os.path.join(folder, f) for f in os.listdir(folder)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    )


def check_play_phone():
    if not os.path.isdir(PLAY_PHONE):
        missing.append("play-phone/ (at least 2 phone screenshots)")
        return
    shots = images(PLAY_PHONE)
    if not 2 <= len(shots) <= 8:
        broken.append(f"play-phone: {len(shots)} screenshots; Play takes 2 to 8 per device type")
    promo = 0
    for path in shots:
        name = os.path.relpath(path, STORE)
        im = Image.open(path)
        w, h = im.size
        if has_alpha(im):
            broken.append(f"{name}: has an alpha channel (Play: 24-bit PNG or JPEG, no alpha)")
        if min(w, h) < 320 or max(w, h) > 3840:
            broken.append(f"{name}: {w}x{h}, outside 320..3840")
        if max(w, h) > 2 * min(w, h):
            broken.append(f"{name}: {w}x{h}, ratio {max(w, h) / min(w, h):.2f} (Play: at most 2.0)")
        if min(w, h) >= 1080 and abs(max(w, h) / min(w, h) - 16 / 9) < 0.01:
            promo += 1
    if promo < 4:
        notes.append(f"play-phone: {promo} shots are 9:16 at 1080+; promotion needs at least 4")


def check_play_icon():
    if not os.path.exists(PLAY_ICON):
        missing.append("play-icon-512.png")
        return
    im = Image.open(PLAY_ICON)
    if im.size != (512, 512):
        broken.append(f"play-icon-512.png: {im.size[0]}x{im.size[1]}, Play wants 512x512")
    if im.format != "PNG" or im.mode != "RGBA":
        broken.append(f"play-icon-512.png: {im.format} {im.mode}, Play wants a 32-bit PNG (RGBA)")
    if os.path.getsize(PLAY_ICON) > 1024 * 1024:
        broken.append("play-icon-512.png: over 1024 KB")


def check_play_feature():
    if not os.path.exists(PLAY_FEATURE):
        missing.append("play-feature-1024x500.png (Play requires a feature graphic; a design asset, the owner's)")
        return
    im = Image.open(PLAY_FEATURE)
    if im.size != (1024, 500):
        broken.append(f"feature graphic: {im.size[0]}x{im.size[1]}, Play wants 1024x500")
    if has_alpha(im):
        broken.append("feature graphic: has an alpha channel (Play: no alpha)")


def check_apple():
    for folder, sizes in APPLE_SETS.items():
        path = os.path.join(STORE, folder)
        if not os.path.isdir(path):
            continue
        shots = images(path)
        if not 1 <= len(shots) <= 10:
            broken.append(f"{folder}: {len(shots)} screenshots; Apple takes 1 to 10")
        for shot in shots:
            im = Image.open(shot)
            if im.size not in sizes:
                broken.append(f"{os.path.relpath(shot, STORE)}: {im.size[0]}x{im.size[1]}, not one of {sorted(sizes)}")
            if has_alpha(im):
                broken.append(f"{os.path.relpath(shot, STORE)}: has an alpha channel (Apple refuses it)")
    if not any(os.path.isdir(os.path.join(STORE, f)) for f in APPLE_SETS):
        missing.append("Apple screenshots (6.9\" or 6.5\" iPhone, and 13\" iPad): none; cannot be made on this box")


def main():
    check_play_phone()
    check_play_icon()
    check_play_feature()
    check_apple()
    for line in broken:
        print(f"  BROKEN   {line}")
    for line in missing:
        print(f"  MISSING  {line}")
    for line in notes:
        print(f"  note     {line}")
    print("  CONTENT  not checkable here: status bar, frames, QA or owner data. A human looks at every shot.")
    if broken:
        return 1
    return 2 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
