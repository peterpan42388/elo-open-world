# Universe Node Protocol

## Purpose

`ELO Open World` is designed to run as multiple universe deployments that share one source standard and can later interconnect.

Examples:
- `elo-universe-0`
- `elo-universe-1`
- `elo-universe-2`

A single server is not the world. A server is one universe node inside the wider world.

## Core Model

Each universe node must expose the same minimum identity:
- `universeId`
- `sourceRepo`
- `sourceRevision`
- `publicBaseUrl`
- `operatorLabel`
- `protocolVersion`

Suggested example:

```json
{
  "universeId": "elo-universe-0",
  "sourceRepo": "github.com/peterpan42388/elo-open-world",
  "sourceRevision": "ad7654e",
  "publicBaseUrl": "https://world.metavie.co",
  "operatorLabel": "MetaVie",
  "protocolVersion": "openworld.universe.v1"
}
```

## Shared Requirements

Every universe node should:
1. run from the common open-source repository
2. preserve the same project protocol baseline
3. preserve the same plugin manifest standard
4. preserve the same healthcheck standard
5. expose a summary endpoint
6. preserve source-project identity when mirroring data

## Minimum Handshake

A universe-to-universe handshake should exchange:
- node identity
- protocol version
- summary endpoint
- supported plugin standards
- supported project standards
- trust mode

Suggested handshake payload:

```json
{
  "fromUniverseId": "elo-universe-1",
  "toUniverseId": "elo-universe-0",
  "protocolVersion": "openworld.universe.v1",
  "summaryUrl": "https://example.com/api/world/summary",
  "supportedStandards": [
    "elo-open-world.plugin.v1",
    "elo-open-world.healthcheck.v1",
    "elo-open-world.project.v1"
  ],
  "trustMode": "read-only"
}
```

## Interconnection Modes

### 1. Read-Only Discovery
Use case:
- discover projects in another universe
- mirror public metadata only

### 2. Federated Project Discovery
Use case:
- one universe indexes public source projects from another universe
- keeps original `projectId`, `repoFullName`, and `source universe`

### 3. Future Operational Federation
Use case:
- operating projects become callable across universes
- requires settlement, trust, and rate-limit protocols

This mode is not implemented yet.

## Source-of-Truth Rules

- GitHub repository remains the source of truth for source projects.
- Local universe state is the source of truth for local runtime registration.
- Mirrored projects must preserve:
  - original source universe
  - original GitHub repository
  - original project id when possible

## Conflict Rule

When multiple universes expose the same project repository:
- prefer the original source universe metadata
- treat local copies as mirrors
- never silently rewrite source ownership

## Security Boundary

Universe federation must start from public metadata only.
Do not assume:
- shared trust
- shared credentials
- shared execution rights
- shared private user data

The first safe baseline is:
- public summary
- public project discovery
- explicit operator approval for any stronger link

## Current Status

This protocol is a baseline design document.
Implementation priority:
1. universe identity document
2. universe summary exposure
3. read-only remote discovery
4. federated project graph
5. future settlement and operation bridge
