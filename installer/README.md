# ELO Agent Onboarder Installer

This installer is a Python GUI wizard for normal users to install OpenClaw and register into EOW.

## Features

- EOW OAuth2 PKCE browser authorization (no manual Session Human ID input)
- Environment check
- 4-tier package selection
- Agent info (`name`, `personality`)
- Model setup (`provider`, `model`, `api key`) with official links
- Chat binding setup (`Telegram`, `Feishu`)
- Skill preview
- Stripe checkout before installation
- Installer session execution plan + ephemeral script execution
- Install completion + `Register to EOW`
- Branded icon pack (`icon_master.svg`, `icon.icns`, `icon.ico`)

## Build End-User Installer (Recommended)

The expected user-facing outputs are:
- macOS: `.app.zip`
- Windows: `.exe` (and `.zip` fallback)

Build on each target OS:

```bash
cd installer
python3.12 -m venv .venv312
source .venv312/bin/activate
pip install -r requirements.txt "pyinstaller>=6.7.0"
python build_installer.py --target macos
```

```powershell
cd installer
py build_installer.py --target windows
```

Generated files:
- `installer/dist/macos/ELO-Agent-Onboarder-Installer.app.zip`
- `installer/dist/windows/ELO-Agent-Onboarder-Installer.exe`
- `installer/dist/windows/ELO-Agent-Onboarder-Installer.zip`

The EOW API endpoint `/api/onboarder/installer/download?os=macos|windows` will serve these executable artifacts first if present.

## Developer Run (Source)

```bash
cd installer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python eow_onboarder_installer.py
```

## Notes

- The installer now uses OAuth2 Authorization Code + PKCE as primary auth flow and auto-detects authorized human identity.
- Installer login UI is OAuth-only (no legacy fallback button).
- Build output now includes `dist/<platform>/version.txt` for release traceability.
- Stripe payment is required before install execution.
- Install script is written to a temporary file and deleted after execution.
- If executable artifacts do not exist, the API currently falls back to source bundle delivery (`.py + launcher`) for internal use.
- macOS packaging is recommended on `Python 3.12` for runtime stability.
