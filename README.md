# shhheth

Live counter of all ETH ever shielded in Ethereum privacy protocols.

This is a cumulative all-time deposit count, not TVL — withdrawals do not reduce it.

## Workspaces

- `web/` — Next.js 16 dashboard (the odometer) + `/flow` (pool flow)
- `subgraph-aztec/` — Aztec Connect shielded ETH
- `subgraph-tornado/` — Tornado Cash ETH pools (cumulative + per-event for Flow)
- `subgraph-railgun/` — Railgun shielded ETH
- `subgraph-0xbow/` — 0xbow Privacy Pools ETH

One immutable subgraph deployment per protocol, so adding or redeploying one
never re-indexes the others.

## Flow (`/flow`)

Bipartite deposit ↔ withdrawal view for Tornado Cash ETH pools over a time
window (24h / 7d). Quiet ink by default; denomination color + dot texture on
hover — same language as the home inflow chart.

Uses `shhheth-tornado-flow/1.0.0` event entities (`TornadoDeposit`,
`TornadoWithdrawal`) with a recent `startBlock` so 24h/7d windows index
quickly. Full-history reindex is `shhhethgrok-tornado/0.2.0`. Home totals
still read `shhhethgrok-tornado/0.1.0`.

## Live subgraphs

Each package builds the exact deployment its Goldsky endpoint serves (see
`web/src/lib/protocols.ts`):

| Protocol | Package | Goldsky deployment | Global entity |
|----------|---------|--------------------|---------------|
| Aztec Connect (sunset) | `subgraph-aztec/` | `shhhethgrok/0.1.0` | `Global` |
| Tornado Cash | `subgraph-tornado/` | `shhhethgrok-tornado` | `TornadoGlobal` |
| Railgun | `subgraph-railgun/` | `shhheth-railgun/2.0.0` | `RailgunGlobal` |
| 0xbow Privacy Pools | `subgraph-0xbow/` | `shhheth-0xbow/1.0.0` | `BowGlobal` |

## Develop

```bash
pnpm install
pnpm dev                       # web
pnpm subgraph:codegen          # regenerate types for every subgraph package
pnpm subgraph:build            # compile every subgraph to wasm
pnpm subgraph:deploy:aztec     # deploy one protocol (also :tornado, :railgun, :0xbow)
```
