'use client';

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { FlatLogRecord } from '@/lib/otlp/flatten';
import { LogTable } from '@/components/LogTable';

// ─── Severity bands (mirrors Histogram + LogTable colors) ─────────────────────
const BANDS = [
  { key: 'trace', min: 1,  max: 4,  color: '#71717a' },
  { key: 'debug', min: 5,  max: 8,  color: '#3b82f6' },
  { key: 'info',  min: 9,  max: 12, color: '#22c55e' },
  { key: 'warn',  min: 13, max: 16, color: '#eab308' },
  { key: 'error', min: 17, max: 20, color: '#f97316' },
  { key: 'fatal', min: 21, max: 24, color: '#dc2626' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

function bandKey(n: number): BandKey {
  for (const b of BANDS) if (n >= b.min && n <= b.max) return b.key;
  return 'trace'; // UNSPECIFIED → treat as trace
}

// ─── Data ─────────────────────────────────────────────────────────────────────
interface ServiceGroup {
  key: string;
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  logs: FlatLogRecord[];
  bandCounts: Record<BandKey, number>;
}

function groupLogs(logs: FlatLogRecord[]): ServiceGroup[] {
  const map = new Map<string, ServiceGroup>();

  for (const log of logs) {
    const key = log.resource.serviceName || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        key,
        serviceName: key,
        serviceNamespace: log.resource.serviceNamespace,
        serviceVersion: log.resource.serviceVersion,
        logs: [],
        bandCounts: { trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
      });
    }
    const g = map.get(key)!;
    g.logs.push(log);
    g.bandCounts[bandKey(log.severityNumber)]++;
  }

  return [...map.values()].sort((a, b) => {
    if (a.key === 'unknown') return 1;
    if (b.key === 'unknown') return -1;
    return a.key.localeCompare(b.key);
  });
}

// ─── Mini severity distribution bar ──────────────────────────────────────────
function SeverityBar({
  counts,
  total,
}: {
  counts: Record<BandKey, number>;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-20 rounded-full overflow-hidden" aria-hidden>
      {BANDS.map(({ key, color }) => {
        const pct = (counts[key] / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={key}
            style={{ width: `${pct}%`, backgroundColor: color }}
            title={`${key}: ${counts[key]}`}
          />
        );
      })}
    </div>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────
function GroupHeader({
  group,
  isExpanded,
  onToggle,
}: {
  group: ServiceGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900/80 hover:bg-zinc-800/70
        transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
    >
      <ChevronRight
        className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform duration-150 ${
          isExpanded ? 'rotate-90' : ''
        }`}
      />

      {/* Service identity */}
      <span className="font-mono text-sm font-semibold text-zinc-200 truncate">
        {group.serviceName}
      </span>
      {group.serviceNamespace && (
        <span className="font-mono text-xs text-zinc-500 shrink-0">
          {group.serviceNamespace}
        </span>
      )}
      {group.serviceVersion && (
        <span className="font-mono text-xs text-zinc-700 shrink-0">
          v{group.serviceVersion}
        </span>
      )}

      <div className="flex-1 min-w-0" />

      {/* Severity mini bar + count */}
      <SeverityBar counts={group.bandCounts} total={group.logs.length} />
      <span className="text-xs tabular-nums text-zinc-500 w-10 text-right shrink-0">
        {group.logs.length.toLocaleString()}
      </span>
    </button>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
interface GroupedViewProps {
  logs: FlatLogRecord[];
  expandedGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
}

export function GroupedView({ logs, expandedGroups, onToggleGroup }: GroupedViewProps) {
  const groups = useMemo(() => groupLogs(logs), [logs]);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-zinc-600 border border-zinc-800 rounded-lg">
        No logs
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 overflow-auto h-full">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.key);
        // Size the inner LogTable to its content up to a comfortable cap so
        // multiple expanded groups can coexist on screen without each claiming
        // the full viewport height.
        const tableHeight = Math.min(group.logs.length * 41 + 62, 400);

        return (
          <div
            key={group.key}
            className="border border-zinc-800 rounded-lg overflow-hidden shrink-0"
          >
            <GroupHeader
              group={group}
              isExpanded={isExpanded}
              onToggle={() => onToggleGroup(group.key)}
            />
            {isExpanded && (
              <div style={{ height: tableHeight }}>
                <LogTable logs={group.logs} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
