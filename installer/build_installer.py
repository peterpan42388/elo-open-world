#!/usr/bin/env python3
from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / "eow_onboarder_installer.py"
DIST = ROOT / "dist"
BUILD = ROOT / "build"
APP_NAME = "ELO-Agent-Onboarder-Installer"


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print(f"[build] {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd or ROOT), check=True)


def clean() -> None:
    for path in [BUILD, ROOT / "__pycache__", ROOT / f"{APP_NAME}.spec"]:
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
    except Exception:
        run([sys.executable, "-m", "pip", "install", "pyinstaller>=6.7.0"])


def build_with_pyinstaller() -> Path:
    ensure_pyinstaller()
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        APP_NAME,
        str(ENTRY),
    ]
    run(cmd)
    if platform.system() == "Darwin":
        artifact = ROOT / "dist" / f"{APP_NAME}.app"
    else:
        artifact = ROOT / "dist" / APP_NAME
        if platform.system() == "Windows":
            artifact = artifact.with_suffix(".exe")
    if not artifact.exists():
        raise FileNotFoundError(f"Installer artifact not found: {artifact}")
    return artifact


def build_macos() -> None:
    artifact = build_with_pyinstaller()
    target_dir = DIST / "macos"
    target_dir.mkdir(parents=True, exist_ok=True)
    app_bundle = artifact
    app_zip = target_dir / f"{APP_NAME}.app.zip"
    if app_zip.exists():
        app_zip.unlink()
    # No Apple Developer account required: ad-hoc sign to improve local trust checks.
    run(["codesign", "--force", "--deep", "--sign", "-", str(app_bundle)])
    run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app_bundle)])
    run(["ditto", "-c", "-k", "--keepParent", str(app_bundle), str(app_zip)])
    print(f"[build] macOS artifacts ready:\n- {app_zip}")


def build_windows() -> None:
    artifact = build_with_pyinstaller()
    target_dir = DIST / "windows"
    target_dir.mkdir(parents=True, exist_ok=True)
    exe_path = target_dir / f"{APP_NAME}.exe"
    zip_path = target_dir / f"{APP_NAME}.zip"
    if exe_path.exists():
        exe_path.unlink()
    if zip_path.exists():
        zip_path.unlink()
    shutil.copy2(artifact, exe_path)
    run([
        "powershell",
        "-NoProfile",
        "-Command",
        f"Compress-Archive -Path '{exe_path}' -DestinationPath '{zip_path}' -Force",
    ])
    print(f"[build] Windows artifacts ready:\n- {exe_path}\n- {zip_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build ELO Agent Onboarder GUI installer.")
    parser.add_argument("--target", choices=["auto", "macos", "windows"], default="auto")
    args = parser.parse_args()
    clean()
    target = args.target
    if target == "auto":
        system = platform.system()
        if system == "Darwin":
            target = "macos"
        elif system == "Windows":
            target = "windows"
        else:
            raise SystemExit("Unsupported OS for auto target. Use macOS or Windows build host.")
    if target == "macos":
        build_macos()
    elif target == "windows":
        build_windows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
