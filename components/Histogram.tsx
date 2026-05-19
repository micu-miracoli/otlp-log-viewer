'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { FlatLogRecord } from '@/lib/otlp/flatten';

// ─── Severity bands (OTLP spec ranges) ───────────────────────────────────────
const BANDS = [
  { key: 'trace', label: 'TRACE', min: 1,  max: 4,  color: '#71717a' }, // zinc-500
  { key: 'debug', label: 'DEBUG', min: 5,  max: 8,  color: '#3b82f6' }, // blue-500
  { key: 'info',  label: 'INFO',  min: 9,  max: 12, color: '#22c55e' }, // green-500
  { key: 'warn',  label: 'WARN',  min: 13, max: 16, color: '#eab308' }, // yellow-500
  { key: 'error', label: 'ERROR', min: 17, max: 20, color: '#f97316' }, // orange-500
  { key: 'fatal', label: 'FATAL', min: 21, max: 24, color: '#dc2626' }, // red-600
] as const;

type BandKey = (typeof BANDS)[number]['key'];

// ─── Bucket data shape ────────────────────────────────────────────────────────
interface Bucket {
  startMs: number;
  endMs: number;
  label: string;
  trace: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
}

// ─── Bucketing logic ──────────────────────────────────────────────────────────
const NICE_INTERVALS_MS = [
  1_000, 2_000, 5_000, 10_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000,
];

function pickIntervalMs(rangeMs: number, targetBuckets = 30): number {
  const approx = rangeMs / targetBuckets;
  return (
    NICE_INTERVALS_MS.find((iv) => iv >= approx) ??
    NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1]
  );
}

function formatLabel(ms: number, intervalMs: number): string {
  if (intervalMs >= 86_400_000) return format(ms, 'MMM d');
  if (intervalMs >= 3_600_000) return format(ms, 'HH:mm');
  if (intervalMs >= 60_000) return format(ms, 'HH:mm');
  return format(ms, 'HH:mm:ss');
}

function bandKeyFor(n: number): BandKey | null {
  for (const band of BANDS) {
    if (n >= band.min && n <= band.max) return band.key;
  }
  return null; // 0 = UNSPECIFIED — omit from stacked display
}

function buildBuckets(logs: FlatLogRecord[]): Bucket[] {
  if (logs.length === 0) return [];

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const log of logs) {
    if (log.timestampMs < minMs) minMs = log.timestampMs;
    if (log.timestampMs > maxMs) maxMs = log.timestampMs;
  }

  // Guard against all logs landing on the same millisecond.
  const rangeMs = maxMs - minMs || 60_000;
  const intervalMs = pickIntervalMs(rangeMs);

  // Align bucket boundaries to the interval so labels feel "round".
  const origin = Math.floor(minMs / intervalMs) * intervalMs;
  const count = Math.ceil((maxMs - origin) / intervalMs) + 1;

  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => {
    const startMs = origin + i * intervalMs;
    return {
      startMs,
      endMs: startMs + intervalMs,
      label: formatLabel(startMs, intervalMs),
      trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0,
    };
  });

  for (const log of logs) {
    const idx = Math.floor((log.timestampMs - origin) / intervalMs);
    if (idx < 0 || idx >= buckets.length) continue;
    const key = bandKeyFor(log.severityNumber);
    if (key !== null) buckets[idx][key]++;
  }

  return buckets;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  payload: Bucket;
}

function HistogramTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;

  const total = nonZero.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="bg-zinc-900/95 border border-zinc-700 rounded-md px-3 py-2 text-xs shadow-xl space-y-1.5 min-w-[140px]">
      <p className="font-mono text-zinc-400">
        {format(bucket.startMs, 'HH:mm:ss')}
        <span className="mx-1 text-zinc-600">–</span>
        {format(bucket.endMs, 'HH:mm:ss')}
      </p>
      <div className="space-y-0.5">
        {nonZero.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-zinc-400 flex-1">{entry.name}</span>
            <span className="font-mono tabular-nums text-white">{entry.value}</span>
          </div>
        ))}
      </div>
      {nonZero.length > 1 && (
        <div className="pt-1 border-t border-zinc-700/60 flex justify-between text-zinc-500">
          <span>total</span>
          <span className="font-mono tabular-nums text-zinc-300">{total}</span>
        </div>
      )}
    </div>
  );
}

// ─── Public interface ─────────────────────────────────────────────────────────
export interface TimeRange {
  startMs: number;
  endMs: number;
}

interface HistogramProps {
  logs: FlatLogRecord[];
  onRangeChange?: (range: TimeRange | null) => void;
}

export function Histogram({ logs, onRangeChange }: HistogramProps) {
  const buckets = useMemo(() => buildBuckets(logs), [logs]);

  const handleBrushChange = useCallback(
    ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
      if (!onRangeChange || buckets.length === 0) return;
      // If the brush covers the full range, treat it as "no filter".
      const isFullRange =
        startIndex === 0 && endIndex === buckets.length - 1;
      onRangeChange(
        isFullRange
          ? null
          : { startMs: buckets[startIndex].startMs, endMs: buckets[endIndex].endMs }
      );
    },
    [buckets, onRangeChange]
  );

  if (buckets.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-zinc-500">
        No data to display
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={buckets}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          barCategoryGap="8%"
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            content={(props) => (
              <HistogramTooltip
                active={props.active}
                payload={props.payload as unknown as TooltipEntry[] | undefined}
              />
            )}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          {BANDS.map((band) => (
            <Bar
              key={band.key}
              dataKey={band.key}
              stackId="stack"
              fill={band.color}
              name={band.label}
              isAnimationActive={false}
            />
          ))}
          <Brush
            dataKey="label"
            height={20}
            stroke="#3f3f46"
            fill="#18181b"
            travellerWidth={6}
            onChange={handleBrushChange}
            tickFormatter={(val) => String(val)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
