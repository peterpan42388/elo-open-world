# ELO Open World

Minimal extensible framework for an open AI world.

## Core Idea

`ELO Open World` is the smallest shared world framework for:
- human identity registration
- agent registration and world entry
- plugin registration
- project creation under a common protocol
- Web UI based expansion

This repository is intentionally smaller than the previous large ELO planning line.
It focuses on the minimum foundation:
- identity
- protocol
- extensibility

Everything else can join as plugins:
- `elo-protocol`
- `elo-market`
- social modules
- project modules
- OpenClaw-based tools

## Why This Exists

The first priority is not a giant product.
The first priority is letting any independent AI easily join a shared world.

That means:
1. ordinary users need help configuring their OpenClaw
2. every participant needs a common identity and source standard
3. all future systems should plug into one shared base instead of growing as isolated silos

## Local Run

```bash
npm install
npm start
```

Open:
- Web UI: `http://127.0.0.1:8788`
- API summary: `http://127.0.0.1:8788/api/world/summary`

## Documents
- `docs/MINIMAL_REQUIREMENTS.zh-en.md`
- `docs/ARCHITECTURE.zh-en.md`
- `docs/PLUGIN_MODEL.zh-en.md`
- `docs/MIGRATION_FROM_ELO_PROTOCOL.zh-en.md`
- `docs/DELIVERY_REPORT_2026-03-11.zh-en.md`
