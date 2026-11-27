/** UTF-8 encoding keeps server-supplied labels and identifiers inert in tab storage.
 * Previously saved commands use plain JSON and remain resumable.
 */
export function encodePending(intent: unknown) {
  return encodeURIComponent(JSON.stringify(intent));
}

export function readPending<T>(key: string): T | null {
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  return JSON.parse(stored.startsWith("%") ? decodeURIComponent(stored) : stored);
}

/** Preserve existing keys for ordinary identifiers and isolate unusual characters within their segment. */
export function scopeId(value: string) {
  return encodeURIComponent(value);
}
