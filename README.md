# shhheth

Live counter of all ETH ever shielded in Ethereum privacy protocols.

This is a cumulative all-time deposit count, not TVL — withdrawals do not reduce it.

## Workspaces

- `web/` — Next.js 16 dashboard (the odometer)
- `subgraph-aztec/` — Aztec Connect shielded ETH
- `subgraph-tornado/` — Tornado Cash ETH pools
- `subgraph-railgun/` — Railgun shielded ETH
- `subgraph-0xbow/` — 0xbow Privacy Pools ETH

One immutable subgraph deployment per protocol, so adding or redeploying one
never re-indexes the others.

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
