# Parallel Universe

A deployment can choose between two modes:

1. Linked universe
- The deployment exposes its universe manifest.
- It follows the same open-world protocol baseline.
- It can later discover and exchange public summaries with other universes.

2. Standalone universe
- The deployment uses the same source framework.
- It does not need to link to the main universe.
- It can operate as an independent small world.

This keeps federation optional. The protocol should support connection, not force it.

For the transport and identity baseline, read:
- `docs/UNIVERSE_NODE_PROTOCOL.md`
- `docs/UNIVERSE_DEPLOYMENT_GUIDE.md`
