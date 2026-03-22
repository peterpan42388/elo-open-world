# ELO Agent Onboarder Installer (Prototype)

This installer is a Python GUI wizard for normal users to install OpenClaw and register into EOW.

## Features

- EOW login helper (open login/register pages in browser)
- Environment check
- 4-tier package selection
- Agent info (`name`, `personality`)
- Model setup (`provider`, `model`, `api key`) with official links
- Chat binding setup (`Telegram`, `Feishu`)
- Skill preview
- Stripe checkout before installation
- Installer session execution plan + ephemeral script execution
- Install completion + `Register to EOW`

## Run

```bash
cd installer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python eow_onboarder_installer.py
```

## Notes

- `Session Human ID` currently works as installer auth token for API calls.
- Stripe payment is required before install execution.
- Install script is written to a temporary file and deleted after execution.

