# shhheth

Live counter of all ETH ever shielded in Ethereum privacy protocols.

This is a cumulative all-time deposit count, not TVL — withdrawals do not reduce it.

## Workspaces

- `web/` — Next.js 16 dashboard (the odometer)
- `subgraph/` — Goldsky subgraph indexing privacy-protocol deposits

## V0 protocols

- **Aztec Connect** — `0xFF1F2B4ADb9dF6FC8eAFecDcbF96A2B351680455` (sunset Mar 2024)
- **Privacy Pools** ETH pool — `0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB`

## Develop

```bash
pnpm install
pnpm dev                  # web
pnpm subgraph:codegen     # regenerate subgraph types after schema/abi changes
pnpm subgraph:build       # compile AssemblyScript to wasm
pnpm subgraph:deploy      # goldsky subgraph deploy
```
