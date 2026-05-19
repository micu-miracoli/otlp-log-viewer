'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDistanceToNow, format } from 'date-fns';
import { ChevronRight, Copy, Check } from 'lucide-react';
import type { FlatLogRecord } from '@/lib/otlp/flatten';
import type { ResolvedValue } from '@/lib/otlp/anyValue';

// ─── Severity ─────────────────────────────────────────────────────────────────
// Colors deliberately mirror Histogram bands.
const SEVERITY: Record<string, { label: string; bg: string; fg: string }> = {
  trace: { label: 'TRACE', bg: 'bg-zinc-500/15',   fg: 'text-zinc-400'   },
  debug: { label: 'DEBUG', bg: 'bg-blue-500/15',   fg: 'text-blue-400'   },
  info:  { label: 'INFO',  bg: 'bg-green-500/15',  fg: 'text-green-400'  },
  warn:  { label: 'WARN',  bg: 'bg-yellow-500/15', fg: 'text-yellow-400' },
  error: { label: 'ERROR', bg: 'bg-orange-500/15', fg: 'text-orange-400' },
  fatal: { label: 'FATAL', bg: 'bg-red-600/15',    fg: 'text-red-400'    },
};

function severityBand(n: number): keyof typeof SEVERITY {
  if (n >= 21) return 'fatal';
  if (n >= 17) return 'error';
  if (n >= 13) return 'warn';
  if (n >= 9)  return 'info';
  if (n >= 5)  return 'debug';
  return 'trace'; // 1-4 and 0 (UNSPECIFIED)
}

function SeverityPill({ severityNumber, severityText }: { severityNumber: number; severityText: string }) {
  const band = severityBand(severityNumber);
  const { label, bg, fg } = SEVERITY[band];
  return (
    <span
      className={`inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider ${bg} ${fg}`}
    >
      {severityText || label}
    </span>
  );
}

// ─── Time cell ────────────────────────────────────────────────────────────────
function TimeCell({ timestampMs }: { timestampMs: number }) {
  // Guard against epoch-0 timestamps the mock API might produce.
  const isValid = timestampMs > 0;
  if (!isValid) return <span className="text-xs font-mono text-zinc-600">—</span>;

  const relative = formatDistanceToNow(timestampMs, { addSuffix: true });
  const absolute = format(timestampMs, 'yyyy-MM-dd HH:mm:ss.SSS z');
  return (
    <time dateTime={new Date(timestampMs).toISOString()} title={absolute}
      className="text-xs font-mono text-zinc-400 cursor-default whitespace-nowrap"
    >
      {relative}
    </time>
  );
}

// ─── Resolved value helpers ───────────────────────────────────────────────────
function resolvedToString(v: ResolvedValue): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return String(v);
  return JSON.stringify(v);
}

// ─── Copyable value ───────────────────────────────────────────────────────────
function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't toggle row expansion
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1_500);
      });
    },
    [value]
  );

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-1.5 text-left w-full rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
      title={value}
    >
      <span className="font-mono text-xs text-zinc-300 break-all">{value}</span>
      <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto pl-1">
        {copied ? (
          <Check className="w-3 h-3 text-green-400" />
        ) : (
          <Copy className="w-3 h-3 text-zinc-500" />
        )}
      </span>
    </button>
  );
}

// ─── KV grid ──────────────────────────────────────────────────────────────────
function KVGrid({ entries }: { entries: [string, string][] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-700 italic">none</p>;
  }
  return (
    <div className="space-y-1.5">
      {entries.map(([key, val]) => (
        <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 items-start">
          <span className="font-mono text-[11px] text-zinc-500 truncate pt-px" title={key}>
            {key}
          </span>
          <CopyableValue value={val} />
        </div>
      ))}
    </div>
  );
}

// ─── Expanded detail panel ────────────────────────────────────────────────────
function ExpandedPanel({ log }: { log: FlatLogRecord }) {
  const resourceEntries: [string, string][] = (
    [
      ['service.name',      log.resource.serviceName],
      ['service.namespace', log.resource.serviceNamespace],
      ['service.version',   log.resource.serviceVersion],
    ] as [string, string][]
  ).filter(([, v]) => v !== '');

  const scopeEntries: [string, string][] = (
    [
      ['name',    log.scope.name],
      ['version', log.scope.version],
    ] as [string, string][]
  ).filter(([, v]) => v !== '');

  const attrEntries: [string, string][] = Object.entries(log.attributes).map(
    ([k, v]) => [k, resolvedToString(v)]
  );

  return (
    <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-4">
      <div className="grid grid-cols-3 gap-6">
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2.5">
            Resource
          </h4>
          <KVGrid entries={resourceEntries} />
        </section>
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2.5">
            Scope
          </h4>
          <KVGrid entries={scopeEntries} />
        </section>
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2.5">
            Attributes
          </h4>
          <KVGrid entries={attrEntries} />
        </section>
      </div>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────
const COLS: ColumnDef<FlatLogRecord>[] = [
  {
    id: 'severity',
    header: 'Severity',
    size: 110,
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5 min-w-0">
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 text-zinc-600 transition-transform duration-150 ${
            row.getIsExpanded() ? 'rotate-90' : ''
          }`}
        />
        <SeverityPill
          severityNumber={row.original.severityNumber}
          severityText={row.original.severityText}
        />
      </div>
    ),
  },
  {
    id: 'time',
    header: 'Time',
    size: 150,
    cell: ({ row }) => <TimeCell timestampMs={row.original.timestampMs} />,
  },
  // body column is injected by makeColumns() so it can close over `highlight`
];

// ─── Body cell with optional match highlighting ───────────────────────────────
function BodyCell({ body, highlight }: { body: string; highlight: string }) {
  if (!highlight || !body) {
    return (
      <span className="font-mono text-xs text-zinc-300 truncate block" title={body}>
        {body || <span className="text-zinc-700 italic">empty</span>}
      </span>
    );
  }
  const idx = body.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) {
    return (
      <span className="font-mono text-xs text-zinc-300 truncate block" title={body}>
        {body}
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-zinc-300 truncate block" title={body}>
      {body.slice(0, idx)}
      <mark className="bg-yellow-400/25 text-yellow-200 rounded-sm not-italic">
        {body.slice(idx, idx + highlight.length)}
      </mark>
      {body.slice(idx + highlight.length)}
    </span>
  );
}

// ─── Column factory — body column closes over the highlight term ──────────────
function makeColumns(highlight: string): ColumnDef<FlatLogRecord>[] {
  return [
    ...COLS,
    {
      id: 'body',
      header: 'Body',
      cell: ({ row }) => (
        <BodyCell body={resolvedToString(row.original.body)} highlight={highlight} />
      ),
    },
  ];
}

// Grid template shared by header and data rows — keeps columns aligned.
const GRID_COLS = '110px 150px 1fr';

// ─── Data row ─────────────────────────────────────────────────────────────────
function DataRow({
  row,
  onToggle,
}: {
  row: Row<FlatLogRecord>;
  onToggle: (row: Row<FlatLogRecord>) => void;
}) {
  const expanded = row.getIsExpanded();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => onToggle(row)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle(row)}
      className={`grid items-center border-b border-zinc-800/60 cursor-pointer select-none transition-colors duration-75
        hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:bg-zinc-800/50
        ${expanded ? 'bg-zinc-800/40' : ''}`}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {row.getVisibleCells().map((cell) => (
        <div key={cell.id} className="px-3 py-2.5 min-w-0 overflow-hidden">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
}

// ─── Flat virtual items ───────────────────────────────────────────────────────
type FlatItem =
  | { type: 'row';      row: Row<FlatLogRecord>; key: string }
  | { type: 'expanded'; row: Row<FlatLogRecord>; key: string };

const VIRTUALIZE_THRESHOLD = 200;
// Height estimates for the virtualizer — exact values come from measureElement.
const ROW_HEIGHT_ESTIMATE = 41;
const EXPANDED_HEIGHT_ESTIMATE = 180;

// ─── Public props ─────────────────────────────────────────────────────────────
interface LogTableProps {
  logs: FlatLogRecord[];
  highlight?: string;
}

export function LogTable({ logs, highlight = '' }: LogTableProps) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => makeColumns(highlight), [highlight]);

  const table = useReactTable({
    data: logs,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  // Flatten rows + their expanded panels into a single list for the virtualizer.
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    for (const row of rows) {
      items.push({ type: 'row', row, key: `${row.id}-row` });
      if (row.getIsExpanded()) {
        items.push({ type: 'expanded', row, key: `${row.id}-expanded` });
      }
    }
    return items;
  }, [rows]);

  // Hooks must always be called — conditionally disable by setting count to 0.
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? flatItems.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) =>
      flatItems[i]?.type === 'expanded'
        ? EXPANDED_HEIGHT_ESTIMATE
        : ROW_HEIGHT_ESTIMATE,
    overscan: 10,
    getItemKey: (i) => flatItems[i]?.key ?? i,
    measureElement:
      typeof window !== 'undefined'
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const handleToggle = useCallback((row: Row<FlatLogRecord>) => {
    row.toggleExpanded();
  }, []);

  const renderItem = (item: FlatItem) =>
    item.type === 'row' ? (
      <DataRow key={item.key} row={item.row} onToggle={handleToggle} />
    ) : (
      <ExpandedPanel key={item.key} log={item.row.original} />
    );

  return (
    <div className="flex flex-col h-full min-h-0 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Sticky header */}
      <div
        className="grid shrink-0 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm
          text-[10px] font-semibold uppercase tracking-widest text-zinc-500"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        {table.getFlatHeaders().map((header) => (
          <div key={header.id} className="px-3 py-2">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div ref={containerRef} className="flex-1 overflow-auto min-h-0">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
            No logs
          </div>
        ) : shouldVirtualize ? (
          // ── Virtualized rendering (>200 rows) ──────────────────────────────
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const item = flatItems[vItem.index];
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${vItem.start}px)` }}
                >
                  {renderItem(item)}
                </div>
              );
            })}
          </div>
        ) : (
          // ── Normal rendering (≤200 rows) ───────────────────────────────────
          <div>{flatItems.map(renderItem)}</div>
        )}
      </div>

      {/* Row count footer */}
      <div className="shrink-0 border-t border-zinc-800 px-3 py-1.5 flex justify-between items-center
        text-[10px] text-zinc-600 bg-zinc-900/60">
        <span>{logs.length.toLocaleString()} log records</span>
        {shouldVirtualize && (
          <span className="text-zinc-700">virtualized</span>
        )}
      </div>
    </div>
  );
}
