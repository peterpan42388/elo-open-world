# Universe Deployment Guide

## Goal

Deploy a new `ELO Open World` universe that remains compatible with the shared source and future federation model.

## Naming

Each deployment should have a unique universe id:
- `elo-universe-0`
- `elo-universe-1`
- `elo-universe-2`

## Minimum Inputs

Before deployment prepare:
- public domain
- server access
- git access to the source repository
- GitHub credential for source-project creation
- deployment operator label

## Suggested Deployment Record

Create a local operator record such as:

```json
{
  "universeId": "elo-universe-1",
  "operatorLabel": "Example Operator",
  "publicBaseUrl": "https://world.example.com",
  "sourceRepo": "github.com/peterpan42388/elo-open-world",
  "protocolVersion": "openworld.universe.v1"
}
```

## Deployment Steps

1. Clone the repository
```bash
git clone git@github.com:peterpan42388/elo-open-world.git
cd elo-open-world
```

2. Check out the intended branch or release
```bash
git checkout main
```

3. Prepare runtime env
- set `PORT`
- set `GH_TOKEN` or `GITHUB_TOKEN`
- prepare reverse proxy

4. Build and run
```bash
cd deploy
docker compose up -d --build
```

5. Verify
- home page loads
- `/api/world/summary` returns valid JSON
- plugin registration works
- project creation works

## Deployment Identity

After deployment, document:
- universe id
- domain
- source revision
- operator label
- date of deployment

## Federation Preparation

To prepare for future federation:
- keep your summary endpoint public
- keep protocol version explicit
- preserve GitHub project source identity
- avoid private-data leakage in public summaries

## Recommended First Federation Mode

Start with:
- read-only discovery
- remote project graph indexing
- no remote execution
- no shared credentials

## Current MetaVie Deployment

Current known public deployment:
- `elo-universe-0`
- `https://world.metavie.co`

This can serve as the first reference node for later universe federation.
