# -*- coding: utf-8 -*-
"""Phase 1: swap src/aiwork to QwenPaw 2.0 renamed as aiwork."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
LEGACY = SRC / "_legacy_aiwork_1x"
NEW_PKG = SRC / "aiwork"
VENDOR_PKG = ROOT / "vendor" / "qwenpaw-2.0.0.post3" / "src" / "qwenpaw"

TEXT_EXTS = {
    ".py",
    ".md",
    ".txt",
    ".toml",
    ".cfg",
    ".ini",
    ".json",
    ".yml",
    ".yaml",
    ".sh",
    ".ps1",
    ".bat",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".svg",
    ".env",
    ".example",
}


def replace_text(s: str) -> str:
    s = s.replace("from qwenpaw.", "from aiwork.")
    s = s.replace("import qwenpaw.", "import aiwork.")
    s = s.replace("import qwenpaw", "import aiwork")
    s = s.replace("qwenpaw.", "aiwork.")
    s = s.replace('"qwenpaw"', '"aiwork"')
    s = s.replace("'qwenpaw'", "'aiwork'")
    s = s.replace("qwenpaw/", "aiwork/")
    return s


def main() -> None:
    if not VENDOR_PKG.is_dir():
        raise SystemExit(f"Missing vendor package: {VENDOR_PKG}")

    if NEW_PKG.exists() and not LEGACY.exists():
        print(f"Moving {NEW_PKG} -> {LEGACY}")
        NEW_PKG.rename(LEGACY)
    elif NEW_PKG.exists() and LEGACY.exists():
        print("Removing current src/aiwork for replace (legacy already present)")
        shutil.rmtree(NEW_PKG)

    print(f"Copying {VENDOR_PKG} -> {NEW_PKG}")
    shutil.copytree(VENDOR_PKG, NEW_PKG)

    n_files = 0
    for path in NEW_PKG.rglob("*"):
        if not path.is_file():
            continue
        if "__pycache__" in path.parts:
            continue
        if path.suffix.lower() not in TEXT_EXTS and path.name not in {
            "Dockerfile",
            "Makefile",
            "LICENSE",
        }:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new = replace_text(text)
        if new != text:
            path.write_text(new, encoding="utf-8", newline="\n")
            n_files += 1
    print(f"Rewrote {n_files} files")
    print("Done phase1 copy/rename")


if __name__ == "__main__":
    main()
