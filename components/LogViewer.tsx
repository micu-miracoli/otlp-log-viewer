'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { useLogs } from '@/hooks/useLogs';
import { Histogram, type TimeRange } from '@/components/Histogram';
import { LogTable } from '@/components/LogTable';

export function LogViewer() {
  const {
    data: logs = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useLogs();

  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);

  // When new data arrives, clear any stale brush selection.
  // (The histogram will rebuild buckets; the old range may no longer be valid.)
  const filteredLogs = useMemo(() => {
    if (!timeRange) return logs;
    return logs.filter(
      (log) =>
        log.timestampMs >= timeRange.startMs && log.timestampMs <= timeRange.endMs
    );
  }, [logs, timeRange]);

  const lastFetched =
    dataUpdatedAt > 0 ? format(dataUpdatedAt, 'HH:mm:ss') : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-semibold tracking-tight">OTLP Log Viewer</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {isError && (
            <span className="text-red-400">Failed to load logs</span>
          )}
          {lastFetched && !isError && (
            <span className="text-zinc-600 tabular-nums">
              updated {lastFetched}
            </span>
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

        {/* Active filter status */}
        {timeRange ? (
          <div className="shrink-0 flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <span>
              {filteredLogs.length.toLocaleString()} of {logs.length.toLocaleString()} logs
            </span>
            <span className="text-zinc-700 mx-0.5">·</span>
            <span className="font-mono text-zinc-500">
              {format(timeRange.startMs, 'HH:mm:ss')}
              <span className="mx-1 text-zinc-700">–</span>
              {format(timeRange.endMs, 'HH:mm:ss')}
            </span>
          </div>
        ) : !isLoading && (
          <div className="shrink-0 text-[11px] text-zinc-700">
            {logs.length.toLocaleString()} log records · drag the histogram to filter
          </div>
        )}

        {/* Log table */}
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
          ) : (
            <LogTable logs={filteredLogs} />
          )}
        </section>
      </div>
    </div>
  );
}
