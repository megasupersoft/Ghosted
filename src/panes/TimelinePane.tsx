/**
 * Timeline pane — roadmap-style view over the PM store (GitHub Projects
 * Start/Target date fields, or the local board's dates offline).
 *
 * 2026 idiom, not MS-Project: coarse zoom (Month/Quarter/Year), a today line,
 * drag bars to reschedule (writes through the optimistic op queue), edge
 * handles to change start/target independently. No dependency spaghetti.
 */

import { CalendarPlus, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  addDays,
  barSpan,
  daysForDx,
  monthTicks,
  PX_PER_DAY,
  timelineRange,
  xForDate,
  type ZoomLevel,
} from '@/lib/timelineMath'
import { useStore } from '@/store'
import { usePmStore } from '@/store/pm'
import type { PmItem } from '../../electron/pmShared'

const ROW_H = 34

interface DragState {
  itemId: string
  mode: 'move' | 'start' | 'end'
  originX: number
  deltaDays: number
}

export default function TimelinePane(_props: { leafId?: string }) {
  const workspacePath = useStore((s) => s.workspacePath)
  const pm = usePmStore()
  const [zoom, setZoom] = useState<ZoomLevel>('quarter')
  const [drag, setDrag] = useState<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const todayIso = new Date().toISOString().slice(0, 10)
  const items = pm.mode === 'github' ? (pm.snapshot?.items ?? []) : pm.localItems

  // Initialize the shared PM store if the kanban pane hasn't already
  if (workspacePath && !pm.initialized) void pm.init(workspacePath)

  const { scheduled, unscheduled } = useMemo(() => {
    const scheduled: { item: PmItem; span: NonNullable<ReturnType<typeof barSpan>> }[] = []
    const unscheduled: PmItem[] = []
    for (const item of items) {
      if (item.state === 'CLOSED' || item.state === 'MERGED') continue
      const span = barSpan(item.startDate, item.targetDate)
      if (span) scheduled.push({ item, span })
      else unscheduled.push(item)
    }
    scheduled.sort((a, b) => a.span.startIso.localeCompare(b.span.startIso))
    return { scheduled, unscheduled }
  }, [items])

  const range = useMemo(
    () =>
      timelineRange(
        scheduled.map((s) => s.span),
        todayIso,
      ),
    [scheduled, todayIso],
  )
  const ticks = useMemo(() => monthTicks(range, zoom), [range, zoom])
  const chartWidth = range.days * PX_PER_DAY[zoom]
  const todayX = xForDate(todayIso, range.epochIso, zoom)

  // ── Bar dragging ───────────────────────────────────────────────────────────
  const beginDrag = useCallback((e: React.PointerEvent, itemId: string, mode: DragState['mode']) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ itemId, mode, originX: e.clientX, deltaDays: 0 })
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      setDrag({ ...drag, deltaDays: daysForDx(e.clientX - drag.originX, zoom) })
    },
    [drag, zoom],
  )

  const endDrag = useCallback(() => {
    if (!drag) return
    const entry = scheduled.find((s) => s.item.itemId === drag.itemId)
    if (entry && drag.deltaDays !== 0) {
      const { item } = entry
      const d = drag.deltaDays
      if (drag.mode === 'move') {
        pm.setDates(
          item,
          item.startDate ? addDays(item.startDate, d) : null,
          item.targetDate ? addDays(item.targetDate, d) : null,
        )
      } else if (drag.mode === 'start') {
        const nextStart = addDays(entry.span.startIso, d)
        if (!item.targetDate || nextStart <= item.targetDate) pm.setDates(item, nextStart, item.targetDate)
      } else {
        const nextTarget = addDays(entry.span.endIso, d)
        if (!item.startDate || nextTarget >= item.startDate) pm.setDates(item, item.startDate, nextTarget)
      }
    }
    setDrag(null)
  }, [drag, scheduled, pm.setDates])

  const schedule = useCallback(
    (item: PmItem) => {
      pm.setDates(item, todayIso, addDays(todayIso, 7))
    },
    [pm.setDates, todayIso],
  )

  if (!workspacePath) {
    return <div className="kb-empty">open a workspace to see the timeline</div>
  }

  return (
    <div className="tl-wrap">
      <div className="kb-header">
        <span className={`kb-mode ${pm.mode}`}>{pm.mode === 'github' ? 'GitHub' : 'Local'}</span>
        <span className="kb-status-line">
          {scheduled.length} scheduled · {unscheduled.length} unscheduled
        </span>
        <div style={{ flex: 1 }} />
        <div className="tl-zoom">
          {(['month', 'quarter', 'year'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              type="button"
              className={`tl-zoom-btn ${zoom === z ? 'active' : ''}`}
              onClick={() => setZoom(z)}
            >
              {z}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="kb-icon-btn"
          title="Scroll to today"
          onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 200), behavior: 'smooth' })}
        >
          today
        </button>
        {pm.mode === 'github' && (
          <button type="button" className="kb-icon-btn" title="Refresh" onClick={() => pm.refresh()}>
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      <div className="tl-body">
        <div className="tl-labels">
          <div className="tl-axis-spacer" />
          {scheduled.map(({ item }) => (
            <div key={item.itemId} className="tl-label" title={item.title}>
              {item.number ? <span className="kb-card-num">#{item.number}</span> : null}
              <span className="tl-label-text">{item.title}</span>
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="tl-scroll"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="tl-chart" style={{ width: chartWidth, height: (scheduled.length + 1) * ROW_H }}>
            {/* Month grid + labels */}
            {ticks.map((t) => (
              <div
                key={`${t.x}`}
                className={`tl-tick ${t.major ? 'major' : ''}`}
                style={{ left: t.x }}
                data-label={t.label}
              />
            ))}
            {/* Today line */}
            <div className="tl-today" style={{ left: todayX }} />
            {/* Bars */}
            {scheduled.map(({ item, span }, row) => {
              const dragging = drag?.itemId === item.itemId
              const shift = dragging && drag.mode !== 'end' ? drag.deltaDays * PX_PER_DAY[zoom] : 0
              const stretch = dragging && drag.mode !== 'move' ? drag.deltaDays * PX_PER_DAY[zoom] : 0
              const x = xForDate(span.startIso, range.epochIso, zoom)
              const w = Math.max(8, xForDate(span.endIso, range.epochIso, zoom) - x + PX_PER_DAY[zoom])
              const left =
                drag?.mode === 'start' && dragging
                  ? x + shift
                  : x + (drag?.mode === 'move' && dragging ? shift : 0)
              const width =
                dragging && drag.mode === 'start'
                  ? Math.max(8, w - stretch)
                  : dragging && drag.mode === 'end'
                    ? Math.max(8, w + stretch)
                    : w
              return (
                <div
                  key={item.itemId}
                  className={`tl-bar ${span.approximated ? 'approx' : ''} ${dragging ? 'dragging' : ''}`}
                  style={{ top: (row + 1) * ROW_H + 5, left, width }}
                  title={`${item.title}\n${span.startIso} → ${span.endIso}`}
                  onPointerDown={(e) => beginDrag(e, item.itemId, 'move')}
                >
                  <div className="tl-handle left" onPointerDown={(e) => beginDrag(e, item.itemId, 'start')} />
                  <span className="tl-bar-label">{item.title}</span>
                  <div className="tl-handle right" onPointerDown={(e) => beginDrag(e, item.itemId, 'end')} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="tl-unscheduled">
          <span className="tl-unscheduled-title">unscheduled</span>
          {unscheduled.slice(0, 12).map((item) => (
            <button
              key={item.itemId}
              type="button"
              className="tl-unscheduled-item"
              title="Schedule: today → +7 days"
              onClick={() => schedule(item)}
            >
              <CalendarPlus size={11} />
              {item.title}
            </button>
          ))}
          {unscheduled.length > 12 && <span className="kb-status-line">+{unscheduled.length - 12} more</span>}
        </div>
      )}
    </div>
  )
}
