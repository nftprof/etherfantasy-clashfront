# Ether Fantasy — Clash Front

Persistent-world war layer of Ether Fantasy: a TypeScript monorepo (pnpm workspaces).

**Start with the design bible in [`docs/`](./docs/README.md)** — it is the source of truth.
Implementation agents: read [`docs/AGENTS.md`](./docs/AGENTS.md) first, then
[`docs/08-data-models.md`](./docs/08-data-models.md) (canon schemas), then your subsystem doc.

## Layout

- `docs/` — the design & implementation bible (canon; do not drift from it)
- `packages/shared` — canonical types, `CONSTANTS`, enums, id helpers, seeded RNG, `balance.json`
- `packages/sim-engine` — deterministic world tick engine skeleton (docs/01)

## Develop

```sh
pnpm install
pnpm build   # pnpm -r build (topological)
pnpm test    # deterministic golden-master + invariant tests
```
