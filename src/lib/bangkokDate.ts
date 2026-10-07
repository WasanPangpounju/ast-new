// Calendar-date helpers pinned to Asia/Bangkok (fixed UTC+7, no DST), usable on client
// and server. Date-only columns like materials.importDate are stored as Bangkok midnight
// (the sync from Laravel writes D-1T17:00Z for day D), so any YYYY-MM-DD derived from them
// must be read in Bangkok time — slicing toISOString() gives the previous day.

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/** Bangkok calendar date of an instant, as YYYY-MM-DD. */
export function bangkokYmd(d: Date | string): string {
  return new Date(new Date(d).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

/** Instant of 00:00 Bangkok time on the given YYYY-MM-DD. */
export function bangkokMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`)
}
