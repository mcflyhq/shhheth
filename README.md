# shhheth

The quiet index for shielded ETH on Ethereum.

Live at **[shhheth.com](https://shhheth.com)** · Tornado pool flow at **[flow.shhheth.com](https://flow.shhheth.com)**

## What it is

A cumulative **all-time deposit** counter across privacy protocols. Withdrawals do not reduce the number. This is not TVL.

| Surface | URL | Role |
|---------|-----|------|
| Quiet index | [shhheth.com](https://shhheth.com) | Multi-protocol total, breakdown, inflow history |
| Tornado flow | [flow.shhheth.com](https://flow.shhheth.com) | Time-window deposits and withdrawals for Tornado ETH pools |

Flow visualizes public activity only. Cubes and motion are atmospheric. They do not pair a deposit with a withdrawal.

## Stack

- **web/** — Next.js app (index + flow)
- **subgraph-*/** — one subgraph package per protocol (immutable deploys)

Data is indexed on Goldsky and read over GraphQL. Endpoint map: `web/src/lib/protocols.ts`. Flow events: `web/src/lib/flow-data.ts`.

| Protocol | Package | Notes |
|----------|---------|--------|
| Aztec Connect | `subgraph-aztec/` | Sunset |
| Tornado Cash | `subgraph-tornado/` | Cumulative totals + flow event subgraph |
| Railgun | `subgraph-railgun/` | Live |
| 0xbow | `subgraph-0xbow/` | Live |

## Develop

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Web: [http://localhost:3000](http://localhost:3000)  
Flow locally: [http://localhost:3000/flow](http://localhost:3000/flow)  
(In production, flow is only public on `flow.shhheth.com`; the main site redirects `/flow` there.)

```bash
pnpm build                 # production build of web
pnpm --filter web test     # unit tests
pnpm subgraph:codegen      # all subgraph packages
pnpm subgraph:build
```

Optional env (see `web/`):

```bash
# web/.env.local
NEXT_PUBLIC_SITE_URL=https://shhheth.com
NEXT_PUBLIC_FLOW_URL=https://flow.shhheth.com
# TORNADO_FLOW_SUBGRAPH=...   # override default Goldsky flow endpoint
```

Deploy web with Vercel (or any Next host). Point `shhheth.com` and `flow.shhheth.com` at the same project; middleware routes the flow host.

## Subgraphs

Each protocol is a separate package so one redeploy never reindexes the others.

```bash
pnpm subgraph:deploy:tornado
pnpm subgraph:deploy:tornado-flow   # event subgraph used by flow.shhheth.com
pnpm subgraph:deploy:railgun
pnpm subgraph:deploy:0xbow
pnpm subgraph:deploy:aztec
```

You need Graph/Goldsky credentials for deploys. The public app only needs the existing endpoints.

## License

Private for now unless noted otherwise in the repository settings.
