import type { IExportLogsServiceRequest, Fixed64 } from './types';
import { resolveAnyValue, type ResolvedValue } from './anyValue';

export interface FlatLogRecord {
  id: string;
  /** Unix timestamp in milliseconds */
  timestampMs: number;
  severityNumber: number;
  severityText: string;
  body: ResolvedValue;
  attributes: Record<string, ResolvedValue>;
  resource: {
    serviceName: string;
    serviceNamespace: string;
    serviceVersion: string;
  };
  scope: {
    name: string;
    version: string;
  };
}

/**
 * Converts OTLP Fixed64 (nanoseconds) to a JavaScript number in milliseconds.
 *
 * Fixed64 arrives from a JSON API as a decimal string or plain number.
 * LongBits is the in-memory protobuf representation (defensive, rarely seen in JSON).
 *
 * We avoid BigInt literals so this compiles under ES2017 targets. For strings,
 * slicing off the last 6 digits before parseInt gives integer-accurate ms without
 * floating-point rounding. For LongBits we use the factored form:
 *   (high * 2^32 + low) / 1e6  ≡  high * 4294.967296 + low / 1e6
 * which is precise enough for display timestamps.
 */
function fixed64ToMs(value: Fixed64): number {
  if (typeof value === 'number') {
    return value / 1_000_000;
  }
  if (typeof value === 'string') {
    const ns = value.trim();
    // Strip the last 6 digits (ns → ms) then parse as an integer.
    if (ns.length <= 6) return 0;
    return parseInt(ns.slice(0, ns.length - 6), 10);
  }
  // LongBits { high, low }: `low` can be negative (signed 32-bit), coerce with >>> 0.
  return (value.high >>> 0) * 4294.967296 + (value.low >>> 0) / 1_000_000;
}

export function flattenLogs(response: IExportLogsServiceRequest): FlatLogRecord[] {
  const records: FlatLogRecord[] = [];

  for (const resourceLog of response.resourceLogs ?? []) {
    const resourceAttrs = Object.fromEntries(
      (resourceLog.resource?.attributes ?? []).map((kv) => [
        kv.key,
        resolveAnyValue(kv.value),
      ])
    );

    const resource = {
      serviceName: String(resourceAttrs['service.name'] ?? ''),
      serviceNamespace: String(resourceAttrs['service.namespace'] ?? ''),
      serviceVersion: String(resourceAttrs['service.version'] ?? ''),
    };

    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      const scope = {
        name: scopeLog.scope?.name ?? '',
        version: scopeLog.scope?.version ?? '',
      };

      for (const log of scopeLog.logRecords ?? []) {
        const attributes: Record<string, ResolvedValue> = {};
        for (const kv of log.attributes ?? []) {
          attributes[kv.key] = resolveAnyValue(kv.value);
        }

        records.push({
          id: crypto.randomUUID(),
          timestampMs: fixed64ToMs(log.timeUnixNano),
          severityNumber: log.severityNumber ?? 0,
          severityText: log.severityText ?? '',
          body: resolveAnyValue(log.body),
          attributes,
          resource,
          scope,
        });
      }
    }
  }

  return records;
}
