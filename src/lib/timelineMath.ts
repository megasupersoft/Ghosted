/**
 * Pure date/pixel math for the roadmap timeline pane.
 * All dates are ISO `YYYY-MM-DD` strings interpreted as UTC days.
 */

export type ZoomLevel = 'month' | 'quarter' | 'year'

export const PX_PER_DAY: Record<ZoomLevel, number> = {
  month: 24,
  quarter: 8,
  year: 2.2,
}

const DAY_MS = 86_400_000

export function parseDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)
}

export function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return dayToIso(parseDay(iso) + days)
}

export function xForDate(iso: string, epochIso: string, zoom: ZoomLevel): number {
  return (parseDay(iso) - parseDay(epochIso)) * PX_PER_DAY[zoom]
}

export function daysForDx(dx: number, zoom: ZoomLevel): number {
  return Math.round(dx / PX_PER_DAY[zoom])
}

export interface BarSpan {
  startIso: string
  endIso: string
  approximated: boolean
}

/** Effective bar span for an item: real dates when both exist, otherwise a
 * small synthesized span so single-dated items still render. */
export function barSpan(startDate: string | null, targetDate: string | null): BarSpan | null {
  if (startDate && targetDate) {
    return parseDay(targetDate) >= parseDay(startDate)
      ? { startIso: startDate, endIso: targetDate, approximated: false }
      : { startIso: targetDate, endIso: startDate, approximated: false }
  }
  if (targetDate) return { startIso: addDays(targetDate, -2), endIso: targetDate, approximated: true }
  if (startDate) return { startIso: startDate, endIso: addDays(startDate, 2), approximated: true }
  return null
}

export interface TimelineRange {
  epochIso: string
  days: number
}

/** Chart range: two weeks before the earliest date (or today) to a month past
 * the latest, minimum 60 days so empty charts still have a canvas. */
export function timelineRange(spans: BarSpan[], todayIso: string): TimelineRange {
  let min = parseDay(todayIso)
  let max = parseDay(todayIso)
  for (const s of spans) {
    min = Math.min(min, parseDay(s.startIso))
    max = Math.max(max, parseDay(s.endIso))
  }
  const epoch = min - 14
  const end = max + 30
  return { epochIso: dayToIso(epoch), days: Math.max(60, end - epoch) }
}

export interface Tick {
  x: number
  label: string
  major: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Month-start ticks across the range; January is major (labeled with year). */
export function monthTicks(range: TimelineRange, zoom: ZoomLevel): Tick[] {
  const ticks: Tick[] = []
  const epochDay = parseDay(range.epochIso)
  const start = new Date(epochDay * DAY_MS)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  if (cursor.getTime() < epochDay * DAY_MS) cursor.setUTCMonth(cursor.getUTCMonth() + 1)

  while (cursor.getTime() / DAY_MS <= epochDay + range.days) {
    const iso = cursor.toISOString().slice(0, 10)
    const month = cursor.getUTCMonth()
    if (zoom !== 'year' || month % 3 === 0) {
      ticks.push({
        x: xForDate(iso, range.epochIso, zoom),
        label:
          month === 0 ? String(cursor.getUTCFullYear()) : zoom === 'year' ? MONTHS[month] : MONTHS[month],
        major: month === 0,
      })
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return ticks
}
