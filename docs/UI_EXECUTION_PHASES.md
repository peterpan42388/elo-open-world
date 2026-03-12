# UI Execution Phases

## Phase A: Entry Separation
Goal:
- move user admission out of the world view
- separate home, join, settings, world, build, market, and docs

Completed:
- Home is guide-first
- Join is independent
- Settings is independent
- World is graph-first

## Phase B: User-State UI
Goal:
- show different UI for signed-out and signed-in states
- move private controls into Settings

Completed:
- topbar shows Join when signed out
- topbar shows Settings when signed in
- local session state is active

## Phase C: Project Graph World
Goal:
- render the world as a project graph, not as a form dashboard
- treat projects as the atomic unit

Current Scope:
- universe root node
- project nodes
- relation summary by shared owner / plugins / agents
- chat placeholder under the graph

## Phase D: Build Workspace
Goal:
- represent all source projects in one workspace
- filter by type, state, and query
- keep plugin and source project creation in Build

## Phase E: Market Workspace
Goal:
- show only operating projects
- attach pricing, usage, source-project origin, and settlement protocol

Status:
- placeholder only

## Phase F: Multi-Universe Docs
Goal:
- define universe deployment identity
- document universe-to-universe interconnection
- standardize shared source + deploy procedure

Status:
- docs placeholder only
