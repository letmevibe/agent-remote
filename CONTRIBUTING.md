# Contributing to Agent Remote

Thank you for your interest in contributing to **Agent Remote**!

## Development Setup

```bash
npm install
npm run build
npm run typecheck
```

## Adding a New Agent Adapter

Every coding agent plugs into the Host Bridge through the `AgentAdapter` interface in `apps/bridge/src/adapters/base.ts`:

1. Create a new file in `apps/bridge/src/adapters/<agent-name>.ts`.
2. Implement `detect()` (checks if the CLI is available in `PATH`) and `runTurn(ctx)` (spawns the agent, emits normalized `StreamEventPayload` events, and returns `{ cancel, respondPermission?, done }`).
3. Register your adapter in `apps/bridge/src/adapters/registry.ts`.
4. Run `npm run build && npm run typecheck` to verify everything compiles cleanly.

## Commit Style

We use concise Conventional Commits:
- `feat(bridge): ...`
- `feat(mobile): ...`
- `fix(protocol): ...`
- `docs: ...`
