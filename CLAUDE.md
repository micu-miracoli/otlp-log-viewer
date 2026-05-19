# OTLP Log Viewer

## Project Goal

Build a polished observability-focused web application for visualizing OTLP log records from a backend service. Engineers should be able to scan logs quickly, inspect full log details, understand log distribution over time, and switch between a flat log list and service-grouped views.

Core assignment requirements:

- Display logs in a table with severity, time, and body.
- Support expandable log rows that show all attributes.
- Show a histogram of log distribution over time.
- Add a toggle between flat list view and grouped-by-service view.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- TanStack Query
- TanStack Table
- Recharts
- `@opentelemetry/otlp-transformer`

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` because this Next.js version may differ from older conventions.

## API

Fetch logs from:

```text
GET https://take-home-assignment-otlp-logs-api.vercel.app/api/v2/logs
```

The API returns random mock data on each request.

## OTLP Proto

The response conforms to the OTLP Logs protobuf schema:

https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/logs/v1/logs.proto

Useful OTLP example JSON:

https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/logs.json

## Type Rule

Always use types from `@opentelemetry/otlp-transformer`.

## Git and GitHub

Do not commit, push, or run any Git or GitHub commands (`git commit`, `git push`, `gh`, PR creation, etc.). The user commits manually and needs full control over version control.

After implementing changes, stop and wait for the user to QA and review the code. Do not suggest or perform commits unless the user explicitly asks.

