/**
 * Evenly distribute `count` items across business days between [start, end] inclusive.
 * Returns up to `count` Date objects (one per item) sorted ascending. Days are sampled
 * with even spacing across available weekdays; if fewer weekdays than items, dates may
 * repeat — caller should handle.
 */
export function distributeWeekdays(start: Date, end: Date, count: number): Date[] {
  if (count <= 0 || end < start) return [];
  const days: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length === 0) return [];
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    // Even spacing index, jittered by random offset within the bucket
    const bucketSize = days.length / count;
    const base = Math.floor(i * bucketSize);
    const jitter = Math.floor(Math.random() * Math.max(1, Math.ceil(bucketSize)));
    const idx = Math.min(days.length - 1, base + jitter);
    out.push(days[idx]);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
