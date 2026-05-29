# shhheth web (v0)

The frontend for shhheth.xyz — the live cumulative odometer for every ETH that has ever been shielded on Ethereum privacy protocols.

## Current v0 status (Aztec chapter)

- Hero odometer pulls live from the deployed `shhhethgrok/0.1.0` subgraph (Aztec Connect ETH only)
- Daily inflows table (last 7 days)
- Full methodology + brand copy from the original naming session
- Dark, quiet, degen-native aesthetic

The number is **cumulative all-time deposits only**. Withdrawals do not reduce it.

## Development

From the monorepo root:

```bash
pnpm --filter web dev
```

The page will hot-reload. Data is fetched client-side from the public Goldsky endpoint.

## Data source

This frontend is deliberately thin. All numbers come from:

Goldsky subgraph endpoints, one per protocol — see `web/src/lib/protocols.ts`
for the full list. The AssemblyScript sources live in this repo under the
`subgraph-*/` packages (`subgraph-aztec`, `subgraph-tornado`, `subgraph-railgun`,
`subgraph-0xbow`).

## Deploy

Vercel (recommended). The project is already set up for the exact same workflow as the user's other Next.js apps.

## Brand voice

🤫 — shhh. The sound of the product. Loud charts for quiet money.
