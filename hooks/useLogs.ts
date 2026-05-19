'use client';

import { useQuery } from '@tanstack/react-query';
import type { IExportLogsServiceRequest } from '@/lib/otlp/types';
import { flattenLogs, type FlatLogRecord } from '@/lib/otlp/flatten';

async function fetchLogs(): Promise<FlatLogRecord[]> {
  const res = await fetch(
    'https://take-home-assignment-otlp-logs-api.vercel.app/api/v2/logs'
  );
  if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
  const data: IExportLogsServiceRequest = await res.json();
  return flattenLogs(data);
}

export function useLogs() {
  return useQuery<FlatLogRecord[]>({
    queryKey: ['logs'],
    queryFn: fetchLogs,
    staleTime: 30_000,
  });
}
