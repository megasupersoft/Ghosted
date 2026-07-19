import { describe, expect, it } from 'vitest'
import {
  addDays,
  barSpan,
  daysForDx,
  monthTicks,
  PX_PER_DAY,
  parseDay,
  timelineRange,
  xForDate,
} from './timelineMath'

describe('day arithmetic', () => {
  it('round-trips and adds days across month/year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-10', -10)).toBe('2026-02-28')
    expect(parseDay('2026-07-20') - parseDay('2026-07-19')).toBe(1)
  })

  it('maps dates to pixels per zoom and back for drags', () => {
    expect(xForDate('2026-07-11', '2026-07-01', 'month')).toBe(10 * PX_PER_DAY.month)
    expect(xForDate('2026-07-01', '2026-07-01', 'year')).toBe(0)
    expect(daysForDx(PX_PER_DAY.quarter * 7, 'quarter')).toBe(7)
    expect(daysForDx(-PX_PER_DAY.month * 2.4, 'month')).toBe(-2)
  })
})

describe('barSpan', () => {
  it('uses both dates when present and fixes inverted ranges', () => {
    expect(barSpan('2026-07-01', '2026-07-10')).toEqual({
      startIso: '2026-07-01',
      endIso: '2026-07-10',
      approximated: false,
    })
    expect(barSpan('2026-07-10', '2026-07-01')).toEqual({
      startIso: '2026-07-01',
      endIso: '2026-07-10',
      approximated: false,
    })
  })

  it('synthesizes a small span for single-dated items', () => {
    expect(barSpan(null, '2026-07-10')).toEqual({
      startIso: '2026-07-08',
      endIso: '2026-07-10',
      approximated: true,
    })
    expect(barSpan('2026-07-10', null)).toEqual({
      startIso: '2026-07-10',
      endIso: '2026-07-12',
      approximated: true,
    })
    expect(barSpan(null, null)).toBeNull()
  })
})

describe('timelineRange', () => {
  it('pads two weeks before and a month after', () => {
    const r = timelineRange(
      [{ startIso: '2026-07-01', endIso: '2026-07-15', approximated: false }],
      '2026-07-20',
    )
    expect(r.epochIso).toBe('2026-06-17')
    // end = 2026-07-20(+today max) → max(15th,20th)=20th +30 → days = to 2026-08-19
    expect(r.days).toBe(parseDay('2026-08-19') - parseDay('2026-06-17'))
  })

  it('spans at least 60 days with no items', () => {
    const r = timelineRange([], '2026-07-20')
    expect(r.days).toBeGreaterThanOrEqual(60)
    expect(r.epochIso).toBe('2026-07-06')
  })
})

describe('monthTicks', () => {
  it('emits month starts with January as major year tick', () => {
    const ticks = monthTicks({ epochIso: '2026-11-15', days: 120 }, 'month')
    const labels = ticks.map((t) => t.label)
    expect(labels).toContain('Dec')
    expect(labels).toContain('2027')
    const jan = ticks.find((t) => t.label === '2027')
    expect(jan?.major).toBe(true)
    expect(jan?.x).toBe(xForDate('2027-01-01', '2026-11-15', 'month'))
  })

  it('year zoom keeps only quarter starts', () => {
    const ticks = monthTicks({ epochIso: '2026-01-01', days: 365 }, 'year')
    expect(ticks.map((t) => t.label)).toEqual(['2026', 'Apr', 'Jul', 'Oct', '2027'])
  })
})
