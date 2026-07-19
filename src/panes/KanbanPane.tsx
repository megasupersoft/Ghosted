/**
 * Kanban pane — Linear-grade board over GitHub Projects v2 (or a local board
 * when offline / no remote). Rendering reads the pm store snapshot; every
 * mutation is optimistic via the main-process op queue.
 *
 * Keyboard contract (2026 de-facto standard):
 *   arrows/J/K move focus · X select · Shift+X range-select · S move status
 *   C new card · Enter details · O open on GitHub · / filter · ? help · Esc clear
 */

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CircleDot,
  ExternalLink,
  GitPullRequest,
  HelpCircle,
  Inbox,
  RefreshCw,
  StickyNote,
  X,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { usePmStore } from '@/store/pm'
import type { PmFieldOption, PmItem } from '../../electron/pmShared'

const TRIAGE: PmFieldOption = { id: '__triage', name: 'Triage' }

interface BoardColumn {
  option: PmFieldOption
  items: PmItem[]
}

function buildColumns(items: PmItem[], options: PmFieldOption[], filter: string): BoardColumn[] {
  const q = filter.trim().toLowerCase()
  const visible = q
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.number ?? '').includes(q) ||
          i.labels.some((l) => l.name.toLowerCase().includes(q)) ||
          i.assignees.some((a) => a.toLowerCase().includes(q)),
      )
    : items
  const triage = visible.filter((i) => i.status === null)
  const cols: BoardColumn[] = []
  if (triage.length > 0) cols.push({ option: TRIAGE, items: triage })
  for (const option of options) {
    cols.push({
      option,
      items: visible.filter((i) => i.statusOptionId === option.id || i.status === option.name),
    })
  }
  return cols
}

function relativeTime(ts: number | null): string {
  if (!ts) return '—'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--red)',
  p0: 'var(--red)',
  high: 'var(--orange)',
  p1: 'var(--orange)',
  medium: 'var(--amber)',
  p2: 'var(--amber)',
  low: 'var(--sky)',
  p3: 'var(--sky)',
}

const Card = memo(function Card({
  item,
  focused,
  selected,
  pending,
  onClickCard,
}: {
  item: PmItem
  focused: boolean
  selected: boolean
  pending: boolean
  onClickCard: (item: PmItem, e: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.itemId,
  })
  const prColor = item.priority ? (PRIORITY_COLOR[item.priority.toLowerCase()] ?? 'var(--text-muted)') : null
  return (
    <div
      ref={setNodeRef}
      data-item-id={item.itemId}
      className={`kb-card ${focused ? 'focused' : ''} ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => onClickCard(item, e)}
      {...attributes}
      {...listeners}
    >
      <div className="kb-card-title">
        {item.contentType === 'PullRequest' ? (
          <GitPullRequest size={13} className="kb-card-type pr" />
        ) : item.contentType === 'DraftIssue' ? (
          <StickyNote size={13} className="kb-card-type draft" />
        ) : (
          <CircleDot size={13} className="kb-card-type" />
        )}
        <span>{item.title}</span>
      </div>
      <div className="kb-card-meta">
        {item.number && <span className="kb-card-num">#{item.number}</span>}
        {prColor && (
          <span className="kb-card-priority" style={{ color: prColor, borderColor: prColor }}>
            {item.priority}
          </span>
        )}
        {item.labels.slice(0, 3).map((l) => (
          <span
            key={l.name}
            className="kb-card-label"
            style={{ background: `#${l.color}33`, color: `#${l.color}` }}
          >
            {l.name}
          </span>
        ))}
        {item.assignees.length > 0 && <span className="kb-card-assignee">@{item.assignees[0]}</span>}
        {pending && <span className="kb-card-pending" title="Syncing to GitHub…" />}
      </div>
    </div>
  )
})

function Column({
  column,
  colIndex,
  focus,
  selected,
  pendingIds,
  creating,
  onClickCard,
  onCreate,
  onCancelCreate,
}: {
  column: BoardColumn
  colIndex: number
  focus: { col: number; row: number } | null
  selected: Set<string>
  pendingIds: Set<string>
  creating: boolean
  onClickCard: (item: PmItem, e: React.MouseEvent) => void
  onCreate: (title: string) => void
  onCancelCreate: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.option.id })
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  return (
    <div className={`kb-col ${isOver ? 'over' : ''}`}>
      <div className="kb-col-header">
        {column.option.id === TRIAGE.id && <Inbox size={13} />}
        <span>{column.option.name}</span>
        <span className="kb-col-count">{column.items.length}</span>
      </div>
      <SortableContext items={column.items.map((i) => i.itemId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="kb-col-body">
          {column.items.map((item, row) => (
            <Card
              key={item.itemId}
              item={item}
              focused={focus?.col === colIndex && focus?.row === row}
              selected={selected.has(item.itemId)}
              pending={pendingIds.has(item.itemId)}
              onClickCard={onClickCard}
            />
          ))}
          {creating && (
            <input
              ref={inputRef}
              className="kb-new-card"
              placeholder="Issue title — Enter to create"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  onCreate(e.currentTarget.value.trim())
                  e.currentTarget.value = ''
                } else if (e.key === 'Escape') {
                  onCancelCreate()
                }
                e.stopPropagation()
              }}
              onBlur={onCancelCreate}
            />
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export default function KanbanPane(_props: { leafId?: string }) {
  const workspacePath = useStore((s) => s.workspacePath)
  const pm = usePmStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const [filter, setFilter] = useState('')
  const [focus, setFocus] = useState<{ col: number; row: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [statusMenu, setStatusMenu] = useState(false)
  const [creatingCol, setCreatingCol] = useState<number | null>(null)
  const [detail, setDetail] = useState<PmItem | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [dragItem, setDragItem] = useState<PmItem | null>(null)
  const [, forceTick] = useState(0)

  const snapshot = pm.snapshot
  const items = pm.mode === 'github' ? (snapshot?.items ?? []) : pm.localItems
  const options = pm.columns()
  const columns = useMemo(() => buildColumns(items, options, filter), [items, options, filter])
  const pendingIds = useMemo(() => new Set(snapshot?.pendingItemIds ?? []), [snapshot?.pendingItemIds])

  // Init + visibility + "last synced" ticker
  useEffect(() => {
    if (workspacePath && !pm.initialized) void pm.init(workspacePath)
  }, [workspacePath, pm.initialized, pm.init])
  useEffect(() => {
    pm.setVisible(true)
    const t = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => {
      pm.setVisible(false)
      clearInterval(t)
    }
  }, [pm.setVisible])

  const focusedItem = focus ? (columns[focus.col]?.items[focus.row] ?? null) : null
  const targets =
    selected.size > 0 ? items.filter((i) => selected.has(i.itemId)) : focusedItem ? [focusedItem] : []

  const moveTargets = useCallback(
    (option: PmFieldOption) => {
      for (const t of targets) {
        pm.setStatus(t, option.id === TRIAGE.id ? null : option)
        // keyboard move → top of column (Linear convention)
        pm.reorder({ ...t, statusOptionId: option.id, status: option.name }, null)
      }
      setStatusMenu(false)
      setSelected(new Set())
    },
    [targets, pm.setStatus, pm.reorder],
  )

  // ── Keyboard contract ──────────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const cols = columns.length
      const clampFocus = (c: number, r: number) => {
        if (cols === 0) return null
        const cc = Math.max(0, Math.min(cols - 1, c))
        const rows = columns[cc].items.length
        return { col: cc, row: Math.max(0, Math.min(rows - 1, r)) }
      }
      switch (e.key) {
        case 'ArrowLeft':
          setFocus((f) => clampFocus((f?.col ?? 0) - (f ? 1 : 0), f?.row ?? 0))
          break
        case 'ArrowRight':
          setFocus((f) => clampFocus((f?.col ?? 0) + (f ? 1 : 0), f?.row ?? 0))
          break
        case 'ArrowUp':
        case 'k':
          setFocus((f) => clampFocus(f?.col ?? 0, (f?.row ?? 0) - (f ? 1 : 0)))
          break
        case 'ArrowDown':
        case 'j':
          setFocus((f) => clampFocus(f?.col ?? 0, (f?.row ?? 0) + (f ? 1 : 0)))
          break
        case 'x':
        case 'X': {
          if (!focusedItem || !focus) break
          if (e.shiftKey && anchor) {
            const colItems = columns[focus.col].items
            const a = colItems.findIndex((i) => i.itemId === anchor)
            if (a >= 0) {
              const [lo, hi] = [Math.min(a, focus.row), Math.max(a, focus.row)]
              setSelected((sel) => {
                const next = new Set(sel)
                for (let r = lo; r <= hi; r++) next.add(colItems[r].itemId)
                return next
              })
              break
            }
          }
          setSelected((sel) => {
            const next = new Set(sel)
            if (next.has(focusedItem.itemId)) next.delete(focusedItem.itemId)
            else next.add(focusedItem.itemId)
            return next
          })
          setAnchor(focusedItem.itemId)
          break
        }
        case 's':
        case 'S':
          if (targets.length > 0) setStatusMenu(true)
          break
        case 'c':
        case 'C':
          setCreatingCol(focus?.col ?? 0)
          break
        case 'Enter':
          if (focusedItem) setDetail(focusedItem)
          break
        case 'o':
        case 'O':
          if (focusedItem?.url) void window.electron.shell.openExternal(focusedItem.url)
          break
        case '/':
          e.preventDefault()
          filterRef.current?.focus()
          break
        case '?':
          setShowHelp((h) => !h)
          break
        case 'Escape':
          setSelected(new Set())
          setStatusMenu(false)
          setDetail(null)
          setShowHelp(false)
          break
        default:
          return
      }
      e.preventDefault()
    },
    [columns, focus, focusedItem, anchor, targets],
  )

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragStart = (e: DragStartEvent) => {
    setDragItem(items.find((i) => i.itemId === e.active.id) ?? null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragItem(null)
    const { active, over } = e
    if (!over) return
    const item = items.find((i) => i.itemId === active.id)
    if (!item) return

    const destCol =
      columns.find((c) => c.option.id === over.id) ??
      columns.find((c) => c.items.some((i) => i.itemId === over.id))
    if (!destCol) return

    const overIndex = destCol.items.findIndex((i) => i.itemId === over.id)
    const dropIndex = overIndex === -1 ? destCol.items.length : overIndex
    const afterItemId = dropIndex === 0 ? null : (destCol.items[dropIndex - 1]?.itemId ?? null)

    const sameColumn = destCol.items.some((i) => i.itemId === item.itemId)
    if (!sameColumn) {
      pm.setStatus(item, destCol.option.id === TRIAGE.id ? null : destCol.option)
    }
    if (afterItemId !== item.itemId) pm.reorder(item, afterItemId)
  }

  const onClickCard = useCallback(
    (item: PmItem, e: React.MouseEvent) => {
      const pos = (() => {
        for (let c = 0; c < columns.length; c++) {
          const r = columns[c].items.findIndex((i) => i.itemId === item.itemId)
          if (r >= 0) return { col: c, row: r }
        }
        return null
      })()
      setFocus(pos)
      if (e.metaKey || e.ctrlKey) {
        setSelected((sel) => {
          const next = new Set(sel)
          if (next.has(item.itemId)) next.delete(item.itemId)
          else next.add(item.itemId)
          return next
        })
      } else if (e.detail === 2) {
        setDetail(item)
      }
    },
    [columns],
  )

  // ── Empty / status states ──────────────────────────────────────────────────
  if (!workspacePath) {
    return <div className="kb-empty">open a workspace to see the board</div>
  }

  const mode = pm.mode
  const statusLine =
    mode === 'github'
      ? `${snapshot?.selectedProject?.title ?? ''} · synced ${relativeTime(snapshot?.lastSyncedAt ?? null)}`
      : mode === 'local'
        ? 'local board (.ghosted/kanban.json)'
        : 'connecting…'

  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: pane-level keyboard model (roving focus)
    <div ref={wrapRef} className="kb-wrap" tabIndex={0} onKeyDown={onKeyDown} role="application">
      <div className="kb-header">
        {mode === 'github' && (snapshot?.projects.length ?? 0) > 1 ? (
          <select
            className="kb-project-select"
            value={snapshot?.selectedProject?.number ?? ''}
            onChange={(e) => pm.selectProject(Number(e.target.value))}
          >
            {snapshot?.projects.map((p) => (
              <option key={p.id} value={p.number}>
                {p.title}
              </option>
            ))}
          </select>
        ) : (
          <span className={`kb-mode ${mode}`}>{mode === 'github' ? 'GitHub' : 'Local'}</span>
        )}
        <span className="kb-status-line">{statusLine}</span>
        {(snapshot?.pendingOps ?? 0) > 0 && (
          <span className="kb-pending-badge">{snapshot?.pendingOps} syncing</span>
        )}
        {(snapshot?.failedOps ?? 0) > 0 && (
          <span className="kb-failed-badge">{snapshot?.failedOps} failed</span>
        )}
        {snapshot?.rateLimit && snapshot.rateLimit.remaining < 500 && (
          <span className="kb-failed-badge">rate limit low ({snapshot.rateLimit.remaining})</span>
        )}
        {snapshot?.error && mode === 'github' && (
          <span className="kb-failed-badge" title={snapshot.error}>
            sync error
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input
          ref={filterRef}
          className="kb-filter"
          placeholder="filter…  ( / )"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setFilter('')
              ;(e.target as HTMLInputElement).blur()
            }
            e.stopPropagation()
          }}
        />
        {mode === 'github' && (
          <button type="button" className="kb-icon-btn" title="Refresh now" onClick={() => pm.refresh()}>
            <RefreshCw size={13} />
          </button>
        )}
        <button
          type="button"
          className="kb-icon-btn"
          title="Keyboard shortcuts (?)"
          onClick={() => setShowHelp(true)}
        >
          <HelpCircle size={13} />
        </button>
      </div>

      {mode === 'connecting' && <div className="kb-empty">connecting to GitHub Projects…</div>}
      {snapshot?.status === 'no-gh' && mode === 'local' && (
        <div className="kb-note">
          gh CLI not authenticated — local board mode. Run `gh auth login` and reopen.
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="kb-board">
          {columns.map((col, ci) => (
            <Column
              key={col.option.id}
              column={col}
              colIndex={ci}
              focus={focus}
              selected={selected}
              pendingIds={pendingIds}
              creating={creatingCol === ci}
              onClickCard={onClickCard}
              onCreate={(title) => {
                pm.createItem(title, col.option.id === TRIAGE.id ? null : col.option)
                setCreatingCol(null)
              }}
              onCancelCreate={() => setCreatingCol(null)}
            />
          ))}
        </div>
        <DragOverlay>
          {dragItem && (
            <div className="kb-card dragging-overlay">
              <div className="kb-card-title">
                <span>{dragItem.title}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Status move menu (S) */}
      {statusMenu && targets.length > 0 && (
        <div className="kb-modal-backdrop" onClick={() => setStatusMenu(false)}>
          <div className="kb-menu" onClick={(e) => e.stopPropagation()}>
            <div className="kb-menu-title">
              Move {targets.length} {targets.length === 1 ? 'item' : 'items'} to…
            </div>
            {options.map((o) => (
              <button key={o.id} type="button" className="kb-menu-item" onClick={() => moveTargets(o)}>
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail */}
      {detail && (
        <div className="kb-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="kb-detail" onClick={(e) => e.stopPropagation()}>
            <div className="kb-detail-head">
              <span className="kb-detail-title">{detail.title}</span>
              <button type="button" className="kb-icon-btn" onClick={() => setDetail(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="kb-detail-sub">
              {detail.repo && (
                <span>
                  {detail.repo}
                  {detail.number ? ` #${detail.number}` : ''}
                </span>
              )}
              {detail.url && (
                <button
                  type="button"
                  className="kb-link"
                  onClick={() => detail.url && window.electron.shell.openExternal(detail.url)}
                >
                  <ExternalLink size={12} /> open on GitHub
                </button>
              )}
            </div>
            <div className="kb-detail-grid">
              <label>
                status
                <select
                  value={detail.statusOptionId ?? ''}
                  onChange={(e) => {
                    const opt = options.find((o) => o.id === e.target.value) ?? null
                    pm.setStatus(detail, opt)
                    setDetail({ ...detail, statusOptionId: opt?.id ?? null, status: opt?.name ?? null })
                  }}
                >
                  <option value="">—</option>
                  {options
                    .filter((o) => o.id !== TRIAGE.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                start
                <input
                  type="date"
                  value={detail.startDate ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null
                    pm.setDates(detail, v, detail.targetDate)
                    setDetail({ ...detail, startDate: v })
                  }}
                />
              </label>
              <label>
                target
                <input
                  type="date"
                  value={detail.targetDate ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null
                    pm.setDates(detail, detail.startDate, v)
                    setDetail({ ...detail, targetDate: v })
                  }}
                />
              </label>
            </div>
            {(detail.assignees.length > 0 || detail.labels.length > 0) && (
              <div className="kb-detail-meta">
                {detail.assignees.map((a) => (
                  <span key={a} className="kb-card-assignee">
                    @{a}
                  </span>
                ))}
                {detail.labels.map((l) => (
                  <span
                    key={l.name}
                    className="kb-card-label"
                    style={{ background: `#${l.color}33`, color: `#${l.color}` }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortcut help */}
      {showHelp && (
        <div className="kb-modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="kb-menu kb-help" onClick={(e) => e.stopPropagation()}>
            <div className="kb-menu-title">Board shortcuts</div>
            {[
              ['←→↑↓ / J K', 'move focus'],
              ['X · Shift+X', 'select · range select'],
              ['S', 'move to status (bulk with selection)'],
              ['C', 'new issue in column'],
              ['Enter', 'open details'],
              ['O', 'open on GitHub'],
              ['/', 'filter'],
              ['Esc', 'clear'],
            ].map(([k, d]) => (
              <div key={k} className="kb-help-row">
                <kbd>{k}</kbd>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
