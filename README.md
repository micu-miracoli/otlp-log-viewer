# OTLP Log Viewer

Take-home for Dash0. A log viewer that fetches [OTLP-formatted logs](https://opentelemetry.io/docs/concepts/signals/logs/) and helps engineers scan, drill into details, and understand distribution patterns across services.

**Live:** _not deployed yet_
**API:** configured via `NEXT_PUBLIC_LOGS_API_URL` in `.env.local`

---

## Run locally

```bash
npm install
cp env.example .env.local
npm run dev
# open http://localhost:3000
```

Node 18+. Requires one env var:

```
NEXT_PUBLIC_LOGS_API_URL=https://take-home-assignment-otlp-logs-api.vercel.app/api/v2/logs
```

Create `.env.local` at the project root with the line above (or `cp env.example .env.local`). When deploying to Vercel, set it as an environment variable in the project settings.

---

## What's in here

- **Log table** with expandable rows: severity pill, relative + absolute time, monospace body. Expanding a row reveals resource attributes, scope, and log-record attributes as copyable key/value grids.
- **Histogram** stacked by severity (TRACE → FATAL), with a brush selector that filters the table to the chosen time range.
- **Text filter** in the toolbar searches across body, severity, service name, scope, and all attribute keys and values. Press `/` to focus, `r` to refresh.
- **Flat ↔ Grouped-by-service** toggle. Grouped view collapses each service with a per-group mini severity distribution bar.
- **URL-persisted view state** — active view mode and expanded service groups serialize to search params so a grouped view with specific services open is a shareable link.
- Dark-mode default, JetBrains Mono for all monospace text, loading skeletons, error + empty states with context-aware messages.

---

## Architecture

Data flows in one direction: `API → flattenLogs() → React Query cache → FlatLogRecord[] → table + histogram`.

The OTLP wire format is deeply nested (`resourceLogs → scopeLogs → logRecords`) and uses `AnyValue` unions for every attribute value. Both UI primitives — the table and the chart — want a flat array of records with resource/scope pre-resolved. The transform happens once at the edge; everything downstream consumes the same `FlatLogRecord[]` shape.

View state is split by durability: view mode and expanded groups live in URL search params (shareable), while the histogram brush selection and text filter are ephemeral React state (reset on refresh, intentionally — they're exploration tools, not saved views).

```
app/                    Next.js App Router shell, providers, layout
components/
├── LogViewer.tsx       URL state (useSearchParams), toolbar, skeleton/empty/error states
├── Histogram.tsx       Recharts BarChart stacked by severity, brush-to-filter
├── LogTable.tsx        TanStack Table + react-virtual, expandable rows
└── GroupedView.tsx     Collapsible service groups, mini severity bar
hooks/
└── useLogs.ts          TanStack Query wrapper, 30 s staleTime
lib/otlp/
├── types.ts            Re-exports from @opentelemetry/otlp-transformer
├── anyValue.ts         Recursive AnyValue resolver
└── flatten.ts          resourceLogs → FlatLogRecord[]
```

---

## Key decisions

- **Types from `@opentelemetry/otlp-transformer`.** Protobuf-accurate and maintained alongside the spec — no hand-rolled types drifting as the OTLP schema evolves.
- **Client-side flattening.** OTLP's nesting is a wire-format concern, not a UI concern. Flatten once, memoize, let every component consume the same `FlatLogRecord[]`.
- **TanStack Query + TanStack Table.** Query gives refetch / stale / error states without ceremony. Table handles row expansion and is layout-agnostic, so the visual design stays in my control (no `<table>` element — div grid for virtualizer compatibility).
- **Recharts.** Built-in `Brush` component powers the chart-driven time filter directly.
- **URL for durable view state only.** View mode and expanded service groups go in the URL. Histogram selection and text filter do not — they're transient and would make URLs unwieldy in normal use. The split previews the filtering/sharing design in Part 2.
- **Severity mapped by OTLP number ranges** (1–4 TRACE, 5–8 DEBUG, 9–12 INFO, 13–16 WARN, 17–20 ERROR, 21–24 FATAL), not by string-matching `severityText`. Same color constants shared across histogram, table pills, and grouped-view mini bars.

---

## Trade-offs I'd revisit

- **All filtering is client-side.** Fine at mock-data volume; wrong at production scale where filtering belongs server-side with the chart and table subscribing to a shared filter AST.
- **Severity colors are duplicated across components.** They should come from a single theme token so histogram, table pills, and mini bars stay in lockstep automatically.
- **Time bucketing auto-picks ~30 buckets across the range.** A real version would let the user pick granularity, and the histogram would render server-aggregated buckets rather than computing from raw records.
- **Row virtualization threshold is 200 rows, untested under load.** The expanded-row height measurement relies on `measureElement` — worth profiling with thousands of records.

---

## What I'd build next

Filtering and sharing — covered in my Part 2 notes. Short version: a filter AST serialized in the URL, server-side execution preferred with a client-side fallback, structured filter chips alongside a free-text DSL (observability convention — Dash0, Datadog, Honeycomb all converge here), and saved views as the durable form of "share an interesting finding."

---

## References

- [OpenTelemetry Logs Concepts](https://opentelemetry.io/docs/concepts/signals/logs/)
- [OTLP Logs protobuf schema](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/logs/v1/logs.proto)
