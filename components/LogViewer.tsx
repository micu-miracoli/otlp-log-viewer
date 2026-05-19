'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RefreshCw, Activity, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useLogs } from '@/hooks/useLogs';
import { Histogram, type TimeRange } from '@/components/Histogram';
import { LogTable } from '@/components/LogTable';
import { GroupedView } from '@/components/GroupedView';
import type { FlatLogRecord } from '@/lib/otlp/flatten';

// ─── URL param keys ───────────────────────────────────────────────────────────
const PARAM_VIEW     = 'view';
const PARAM_EXPANDED = 'expanded';
type ViewMode = 'flat' | 'grouped';

// ─── Skeletons ────────────────────────────────────────────────────────────────
// Heights are deterministic (no Math.random) to avoid SSR-hydration mismatches.
const BAR_HEIGHTS = [35,50,68,42,78,55,88,62,48,72,90,45,65,38,80,92,58,44,70,85,52,75,41,63,37,88,56,77,43,67];
const ROW_WIDTHS  = [62,81,47,73,55,91,41,76,64,52];
const GRID        = '110px 150px 1fr';

function HistogramSkeleton() {
  return (
    <div className="h-48 flex items-end gap-px px-1 pb-7" aria-hidden>
      {BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-zinc-800 rounded-sm animate-pulse"
          style={{ height: `${h}%`, animationDelay: `${i * 30}ms` }}
        />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden" aria-hidden>
      {/* Header */}
      <div className="grid px-3 py-2 bg-zinc-900 border-b border-zinc-800" style={{ gridTemplateColumns: GRID }}>
        {['w-14','w-8','w-20'].map((w, i) => (
          <div key={i} className={`h-2 ${w} bg-zinc-800 rounded-full animate-pulse`} />
        ))}
      </div>
      {/* Rows */}
      {ROW_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="grid px-3 py-2.5 border-b border-zinc-800/60 items-center"
          style={{ gridTemplateColumns: GRID }}
        >
          <div className="h-4 w-12 bg-zinc-800 rounded animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          <div className="h-2.5 w-20 bg-zinc-800/70 rounded-full animate-pulse" style={{ animationDelay: `${i * 40 + 20}ms` }} />
          <div className="h-2.5 bg-zinc-800/50 rounded-full animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 40 + 40}ms` }} />
        </div>
      ))}
    </div>
  );
}

// ─── View segmented control ───────────────────────────────────────────────────
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="group" aria-label="View mode" className="flex items-center bg-zinc-800/60 rounded-md p-0.5 gap-0.5 shrink-0">
      {(['flat', 'grouped'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            value === mode
              ? 'bg-zinc-700 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {mode === 'flat' ? 'Flat' : 'Grouped by Service'}
        </button>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ timeFiltered, textFiltered }: { timeFiltered: boolean; textFiltered: boolean }) {
  const isFiltered = timeFiltered || textFiltered;
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 border-dashed">
      <p className="text-sm text-zinc-500">
        {isFiltered ? 'No logs match the current filters' : 'No log records received'}
      </p>
      <p className="text-xs text-zinc-700">
        {textFiltered && timeFiltered
          ? 'Try clearing the text filter or widening the histogram selection'
          : textFiltered
          ? 'Try a different search term'
          : timeFiltered
          ? 'Try widening the histogram selection'
          : 'Waiting for data from the API'}
      </p>
    </div>
  );
}

// ─── Shell — owns ephemeral brush state + keyboard shortcuts ──────────────────
function LogViewerShell({
  view, expandedGroups, logs,
  isLoading, isError, error,
  isFetching, dataUpdatedAt, refetch,
  onSetView, onToggleGroup,
}: {
  view: ViewMode;
  expandedGroups: ReadonlySet<string>;
  logs: FlatLogRecord[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
  onSetView: (v: ViewMode) => void;
  onToggleGroup: (key: string) => void;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [filterText, setFilterText] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as Element;
      // Skip when focus is inside an input so we don't hijack typing.
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        refetch();
      }
      if (e.key === '/') {
        e.preventDefault();
        filterRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [refetch]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (timeRange) {
      result = result.filter(
        (l) => l.timestampMs >= timeRange.startMs && l.timestampMs <= timeRange.endMs
      );
    }

    const needle = filterText.trim().toLowerCase();
    if (needle) {
      result = result.filter((l) => {
        if (l.severityText.toLowerCase().includes(needle)) return true;
        if (String(l.body ?? '').toLowerCase().includes(needle)) return true;
        if (l.resource.serviceName.toLowerCase().includes(needle)) return true;
        if (l.resource.serviceNamespace.toLowerCase().includes(needle)) return true;
        if (l.scope.name.toLowerCase().includes(needle)) return true;
        return Object.entries(l.attributes).some(
          ([k, v]) =>
            k.toLowerCase().includes(needle) ||
            String(v ?? '').toLowerCase().includes(needle)
        );
      });
    }

    return result;
  }, [logs, timeRange, filterText]);

  const lastFetched    = dataUpdatedAt > 0 ? format(dataUpdatedAt, 'HH:mm:ss') : null;
  const isTimeFiltered = timeRange !== null;
  const isTextFiltered = filterText.trim() !== '';
  const isFiltered     = isTimeFiltered || isTextFiltered;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold tracking-tight">OTLP Log Viewer</span>
        </div>

        {/* Text filter */}
        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
          <input
            ref={filterRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter logs…"
            aria-label="Filter logs"
            className="w-full pl-8 pr-8 py-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/50
              text-xs font-mono text-zinc-300 placeholder:text-zinc-600
              focus:outline-none focus:border-zinc-500 focus:bg-zinc-800 transition-colors"
          />
          {filterText ? (
            <button
              onClick={() => setFilterText('')}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ×
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] px-1 py-0.5
              rounded bg-zinc-700/60 text-zinc-600 font-mono leading-none select-none pointer-events-none">
              /
            </kbd>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3 ml-auto shrink-0 text-xs">
          {isError && <span className="text-red-400">Failed to load</span>}
          {!isLoading && !isError && (
            <span className="text-zinc-600 tabular-nums">
              {logs.length.toLocaleString()} records
            </span>
          )}
          {lastFetched && !isError && (
            <span className="text-zinc-700 tabular-nums hidden sm:inline">
              {lastFetched}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh (r)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700
              text-zinc-400 hover:border-zinc-500 hover:text-zinc-200
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">

        {/* Histogram card */}
        <section className="shrink-0 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Log Distribution
            </span>
            {isTimeFiltered && (
              <button
                onClick={() => setTimeRange(null)}
                className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear selection ×
              </button>
            )}
          </div>
          {isLoading ? <HistogramSkeleton /> : (
            <Histogram logs={logs} onRangeChange={setTimeRange} />
          )}
        </section>

        {/* Status row + view toggle */}
        <div className="shrink-0 flex items-center justify-between gap-4 min-h-[22px]">
          <p className="text-[11px] text-zinc-600">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
                Loading…
              </span>
            ) : isFiltered ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                {filteredLogs.length.toLocaleString()} of {logs.length.toLocaleString()} logs
                {isTextFiltered && (
                  <>
                    <span className="text-zinc-800 mx-0.5">·</span>
                    <span className="font-mono">&ldquo;{filterText.trim()}&rdquo;</span>
                  </>
                )}
                {isTimeFiltered && (
                  <>
                    <span className="text-zinc-800 mx-0.5">·</span>
                    <span className="font-mono">
                      {format(timeRange!.startMs, 'HH:mm:ss')}
                      <span className="mx-1 text-zinc-700">–</span>
                      {format(timeRange!.endMs, 'HH:mm:ss')}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span>
                {logs.length.toLocaleString()} log records
                <span className="text-zinc-700 ml-2">· drag histogram to filter · press r to refresh</span>
              </span>
            )}
          </p>
          <ViewToggle value={view} onChange={onSetView} />
        </div>

        {/* Main view */}
        <section className="flex-1 min-h-0">
          {isError ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 border-dashed">
              <p className="text-sm text-zinc-400">Could not fetch logs</p>
              <p className="text-xs text-zinc-600 max-w-xs text-center">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <button
                onClick={() => refetch()}
                className="mt-1 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : isLoading ? (
            <TableSkeleton />
          ) : filteredLogs.length === 0 ? (
            <EmptyState timeFiltered={isTimeFiltered} textFiltered={isTextFiltered} />
          ) : view === 'grouped' ? (
            <GroupedView
              logs={filteredLogs}
              expandedGroups={expandedGroups}
              onToggleGroup={onToggleGroup}
            />
          ) : (
            <LogTable logs={filteredLogs} />
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Outer component — owns URL state ─────────────────────────────────────────
export function LogViewer() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const view = (params.get(PARAM_VIEW) ?? 'flat') as ViewMode;

  const expandedGroups = useMemo<ReadonlySet<string>>(() => {
    const raw = params.get(PARAM_EXPANDED);
    return new Set(raw ? raw.split(',').filter(Boolean) : []);
  }, [params]);

  const navigate = useCallback(
    (mutate: (p: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const qs  = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      replace ? router.replace(url) : router.push(url);
    },
    [params, pathname, router]
  );

  const handleSetView = useCallback(
    (v: ViewMode) =>
      navigate((p) => {
        if (v === 'flat') { p.delete(PARAM_VIEW); p.delete(PARAM_EXPANDED); }
        else p.set(PARAM_VIEW, v);
      }),
    [navigate]
  );

  const handleToggleGroup = useCallback(
    (key: string) =>
      navigate((p) => {
        const next = new Set(expandedGroups);
        next.has(key) ? next.delete(key) : next.add(key);
        next.size === 0
          ? p.delete(PARAM_EXPANDED)
          : p.set(PARAM_EXPANDED, [...next].join(','));
      }, true),
    [navigate, expandedGroups]
  );

  const {
    data: logs = [], isLoading, isError, error,
    refetch, isFetching, dataUpdatedAt,
  } = useLogs();

  return (
    <LogViewerShell
      view={view}
      expandedGroups={expandedGroups}
      logs={logs}
      isLoading={isLoading}
      isError={isError}
      error={error}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={refetch}
      onSetView={handleSetView}
      onToggleGroup={handleToggleGroup}
    />
  );
}
