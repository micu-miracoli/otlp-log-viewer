'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { RefreshCw, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { useLogs } from '@/hooks/useLogs';
import { Histogram, type TimeRange } from '@/components/Histogram';
import { LogTable } from '@/components/LogTable';
import { GroupedView } from '@/components/GroupedView';
import type { FlatLogRecord } from '@/lib/otlp/flatten';

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = 'flat' | 'grouped';

const PARAM_VIEW     = 'view';
const PARAM_EXPANDED = 'expanded';

// ─── Segmented control ────────────────────────────────────────────────────────
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="group" aria-label="View mode" className="flex items-center bg-zinc-800/60 rounded-md p-0.5 gap-0.5">
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

// ─── Inner shell — owns ephemeral brush state ─────────────────────────────────
// Separated from the URL-state outer so that useState and useSearchParams
// never share a component boundary, keeping hook ordering unambiguous.
function LogViewerShell({
  view,
  expandedGroups,
  logs,
  isLoading,
  isError,
  error,
  isFetching,
  dataUpdatedAt,
  refetch,
  onSetView,
  onToggleGroup,
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

  const filteredLogs = useMemo(
    () =>
      timeRange
        ? logs.filter(
            (l) => l.timestampMs >= timeRange.startMs && l.timestampMs <= timeRange.endMs
          )
        : logs,
    [logs, timeRange]
  );

  const lastFetched = dataUpdatedAt > 0 ? format(dataUpdatedAt, 'HH:mm:ss') : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-semibold tracking-tight">OTLP Log Viewer</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {isError && <span className="text-red-400">Failed to load logs</span>}
          {lastFetched && !isError && (
            <span className="text-zinc-600 tabular-nums">updated {lastFetched}</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
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
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Log Distribution
            </span>
            {timeRange && (
              <button
                onClick={() => setTimeRange(null)}
                className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear selection ×
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <span className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <Histogram logs={logs} onRangeChange={setTimeRange} />
          )}
        </section>

        {/* Status + view toggle */}
        <div className="shrink-0 flex items-center justify-between gap-4 min-h-[22px]">
          <div className="text-[11px] text-zinc-500">
            {timeRange ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                {filteredLogs.length.toLocaleString()} of {logs.length.toLocaleString()} logs
                <span className="text-zinc-700 mx-0.5">·</span>
                <span className="font-mono text-zinc-600">
                  {format(timeRange.startMs, 'HH:mm:ss')}
                  <span className="mx-1 text-zinc-700">–</span>
                  {format(timeRange.endMs, 'HH:mm:ss')}
                </span>
              </span>
            ) : !isLoading ? (
              <span className="text-zinc-700">
                {logs.length.toLocaleString()} log records · drag histogram to filter
              </span>
            ) : null}
          </div>
          <ViewToggle value={view} onChange={onSetView} />
        </div>

        {/* Main view */}
        <section className="flex-1 min-h-0">
          {isError ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800">
              <p className="text-sm text-zinc-400">Could not fetch logs</p>
              <p className="text-xs text-zinc-600 max-w-xs text-center">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Try again
              </button>
            </div>
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
// Must be wrapped in <Suspense> by the caller (page.tsx) so that
// useSearchParams doesn't block prerendering in production builds.
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
      const qs = next.toString();
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
        next.size === 0 ? p.delete(PARAM_EXPANDED) : p.set(PARAM_EXPANDED, [...next].join(','));
      }, /* replace */ true),
    [navigate, expandedGroups]
  );

  const {
    data: logs = [],
    isLoading, isError, error,
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
