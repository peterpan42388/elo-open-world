#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENTRY = ROOT / "eow_onboarder_installer.py"
DIST = ROOT / "dist"
BUILD = ROOT / "build"
ASSETS = ROOT / "assets"
APP_NAME = "ELO-Agent-Onboarder-Installer"


def git_commit() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT.parent),
            check=True,
            capture_output=True,
            text=True
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def write_version_file(target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    version = f"commit={git_commit()}\nbuilt_at={datetime.now(timezone.utc).isoformat()}\n"
    version_path = target_dir / "version.txt"
    version_path.write_text(version, encoding="utf-8")
    return version_path


def write_installer_asset_version() -> Path:
    ASSETS.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": git_commit(),
        "commit": git_commit(),
        "builtAt": datetime.now(timezone.utc).isoformat()
    }
    target = ASSETS / "installer_version.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


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
    write_installer_asset_version()
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        APP_NAME,
        "--add-data",
        f"{ASSETS}{';' if platform.system() == 'Windows' else ':'}assets",
        str(ENTRY),
    ]
    if platform.system() == "Darwin":
        icon = ASSETS / "icon.icns"
        if icon.exists():
            cmd.extend(["--icon", str(icon)])
    elif platform.system() == "Windows":
        icon = ASSETS / "icon.ico"
        if icon.exists():
            cmd.extend(["--icon", str(icon)])
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
    version_path = write_version_file(target_dir)
    app_bundle = artifact
    app_zip = target_dir / f"{APP_NAME}.app.zip"
    if app_zip.exists():
        app_zip.unlink()
    # No Apple Developer account required: ad-hoc sign to improve local trust checks.
    run(["codesign", "--force", "--deep", "--sign", "-", str(app_bundle)])
    run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app_bundle)])
    run(["ditto", "-c", "-k", "--keepParent", str(app_bundle), str(app_zip)])
    print(f"[build] macOS artifacts ready:\n- {app_zip}\n- {version_path}")


def build_windows() -> None:
    artifact = build_with_pyinstaller()
    target_dir = DIST / "windows"
    target_dir.mkdir(parents=True, exist_ok=True)
    version_path = write_version_file(target_dir)
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
    print(f"[build] Windows artifacts ready:\n- {exe_path}\n- {zip_path}\n- {version_path}")


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
