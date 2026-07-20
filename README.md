# shhheth

The quiet index for shielded ETH on Ethereum.

**[shhheth.com](https://shhheth.com)** · **[flow.shhheth.com](https://flow.shhheth.com)**

A cumulative all-time **deposit** counter across privacy protocols. Withdrawals do not reduce the number. Not TVL. Not a tracer.

| | |
|--|--|
| Quiet index | Multi-protocol total, breakdown, inflow history |
| Tornado flow | Time-window deposits and withdrawals for Tornado ETH pools. Motion is atmospheric; nothing pairs a deposit with a withdrawal. |

## Contribute

This is meant to be worked on, not just watched.

Good places to help:

- **UI / product** — clarity, mobile, accessibility, reduced motion, performance
- **New protocols** — each protocol is one subgraph package + one entry in `web/src/lib/protocols.ts`
- **Data correctness** — methodology, edge cases, tests under `web/src/lib/*.test.ts`
- **Docs and design language** — keep the voice quiet; no dashboard cosplay

Open an issue if you are unsure where something fits. Small PRs are easier to land than big rewrites.

### Local setup

Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

- Index: [http://localhost:3000](http://localhost:3000)
- Flow: [http://localhost:3000/flow](http://localhost:3000/flow)

```bash
pnpm build
pnpm --filter web test
pnpm --filter web lint
```

Optional `web/.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=https://shhheth.com
NEXT_PUBLIC_FLOW_URL=https://flow.shhheth.com
```

### Project layout

```
web/                 Next.js app (index + flow)
subgraph-tornado/    Tornado Cash
subgraph-railgun/    Railgun
subgraph-0xbow/      0xbow Privacy Pools
subgraph-aztec/      Aztec Connect (sunset)
```

The app is thin on purpose: numbers come from public GraphQL endpoints configured in `web/src/lib/protocols.ts` and `web/src/lib/flow-data.ts`. Subgraph sources live next to the app so anyone can read how totals are defined and propose changes. Deploying new subgraph versions to production indexers is separate from shipping the frontend.

## Principles

1. **Show, do not link.** Public deposits and withdrawals only; never imply pairing.
2. **Quiet ink by default.** Color and texture earn their place on focus.
3. **One number, one truth.** Cumulative deposits; methodology stays short and plain.
4. **Same language, two surfaces.** Index and flow share chrome and tone.

## License

[MIT](./LICENSE). Use it, fork it, ship something quieter.
