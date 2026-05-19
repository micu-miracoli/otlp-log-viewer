'use client';

import { useQuery } from '@tanstack/react-query';
import type { IExportLogsServiceRequest } from '@/lib/otlp/types';
import { flattenLogs, type FlatLogRecord } from '@/lib/otlp/flatten';

const API_URL = process.env.NEXT_PUBLIC_LOGS_API_URL;

async function fetchLogs(): Promise<FlatLogRecord[]> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_LOGS_API_URL is not set');
  const res = await fetch(API_URL);
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
