import type { IAnyValue } from './types';

// Interface breaks the circularity that a recursive type alias can't handle alone.
export interface ResolvedObject {
  [key: string]: ResolvedValue;
}
export type ResolvedValue = string | number | boolean | null | ResolvedValue[] | ResolvedObject;

export function resolveAnyValue(value: IAnyValue | undefined | null): ResolvedValue {
  if (value == null) return null;

  if (value.stringValue != null) return value.stringValue;
  if (value.boolValue != null) return value.boolValue;
  if (value.intValue != null) return value.intValue;
  if (value.doubleValue != null) return value.doubleValue;
  if (value.bytesValue != null) return String(value.bytesValue);

  if (value.arrayValue) {
    return value.arrayValue.values.map(resolveAnyValue);
  }

  if (value.kvlistValue) {
    const obj: ResolvedObject = {};
    for (const kv of value.kvlistValue.values) {
      obj[kv.key] = resolveAnyValue(kv.value);
    }
    return obj;
  }

  return null;
}
