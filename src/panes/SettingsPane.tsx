import React from 'react'
import { useSettings, GhostedSettings } from '@/store/settings'
import { RotateCcw } from 'lucide-react'

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {description && <span className="settings-desc">{description}</span>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max} step={step} className="settings-input" />
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="settings-input">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`settings-toggle ${value ? 'on' : ''}`}>
      <span className="settings-toggle-knob" />
    </button>
  )
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} className="settings-input settings-input-wide" />
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="settings-input" style={{ width: 90 }} />
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <div className="settings-section">{title}</div>
}

export default function SettingsPane() {
  const s = useSettings()
  const up = s.set

  return (
    <div className="settings-panel">
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Settings</span>
        <button onClick={s.resetAll} title="Reset all to defaults" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4 }}>
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="settings-scroll">
        <SectionHeader title="Editor" />
        <SettingRow label="Font Size" description="Editor font size in pixels">
          <NumberInput value={s.editorFontSize} onChange={v => up('editorFontSize', v)} min={8} max={32} />
        </SettingRow>
        <SettingRow label="Font Family" description="Editor font stack">
          <TextInput value={s.editorFontFamily} onChange={v => up('editorFontFamily', v)} />
        </SettingRow>
        <SettingRow label="Tab Size" description="Spaces per tab">
          <NumberInput value={s.editorTabSize} onChange={v => up('editorTabSize', v)} min={1} max={8} />
        </SettingRow>
        <SettingRow label="Word Wrap">
          <SelectInput value={s.editorWordWrap} onChange={v => up('editorWordWrap', v as any)} options={[
            { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }, { value: 'wordWrapColumn', label: 'Column' },
          ]} />
        </SettingRow>
        <SettingRow label="Line Numbers">
          <SelectInput value={s.editorLineNumbers} onChange={v => up('editorLineNumbers', v as any)} options={[
            { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }, { value: 'relative', label: 'Relative' },
          ]} />
        </SettingRow>
        <SettingRow label="Minimap">
          <Toggle value={s.editorMinimap} onChange={v => up('editorMinimap', v)} />
        </SettingRow>
        <SettingRow label="Bracket Colors">
          <Toggle value={s.editorBracketColors} onChange={v => up('editorBracketColors', v)} />
        </SettingRow>
        <SettingRow label="Smooth Scrolling">
          <Toggle value={s.editorSmoothScrolling} onChange={v => up('editorSmoothScrolling', v)} />
        </SettingRow>
        <SettingRow label="Smooth Caret">
          <Toggle value={s.editorSmoothCaret} onChange={v => up('editorSmoothCaret', v)} />
        </SettingRow>
        <SettingRow label="Font Ligatures">
          <Toggle value={s.editorLigatures} onChange={v => up('editorLigatures', v)} />
        </SettingRow>

        <SectionHeader title="Terminal" />
        <SettingRow label="Font Size">
          <NumberInput value={s.terminalFontSize} onChange={v => up('terminalFontSize', v)} min={8} max={32} />
        </SettingRow>
        <SettingRow label="Font Family">
          <TextInput value={s.terminalFontFamily} onChange={v => up('terminalFontFamily', v)} />
        </SettingRow>
        <SettingRow label="Line Height">
          <NumberInput value={s.terminalLineHeight} onChange={v => up('terminalLineHeight', v)} min={1} max={2.5} step={0.05} />
        </SettingRow>
        <SettingRow label="Cursor Blink">
          <Toggle value={s.terminalCursorBlink} onChange={v => up('terminalCursorBlink', v)} />
        </SettingRow>
        <SettingRow label="Cursor Style">
          <SelectInput value={s.terminalCursorStyle} onChange={v => up('terminalCursorStyle', v as any)} options={[
            { value: 'block', label: 'Block' }, { value: 'underline', label: 'Underline' }, { value: 'bar', label: 'Bar' },
          ]} />
        </SettingRow>
        <SettingRow label="Scrollback" description="Lines of history">
          <NumberInput value={s.terminalScrollback} onChange={v => up('terminalScrollback', v)} min={100} max={100000} step={100} />
        </SettingRow>

        <SectionHeader title="Appearance" />
        <SettingRow label="Accent Color">
          <ColorInput value={s.accentColor} onChange={v => up('accentColor', v)} />
        </SettingRow>
        <SettingRow label="UI Font Size">
          <NumberInput value={s.uiFontSize} onChange={v => up('uiFontSize', v)} min={10} max={24} />
        </SettingRow>
        <SettingRow label="Show Hidden Files" description="Show dotfiles in explorer">
          <Toggle value={s.showHiddenFiles} onChange={v => up('showHiddenFiles', v)} />
        </SettingRow>

        <SectionHeader title="Git" />
        <SettingRow label="Auto Refresh" description="Seconds between status checks">
          <NumberInput value={s.gitAutoRefreshInterval} onChange={v => up('gitAutoRefreshInterval', v)} min={1} max={60} />
        </SettingRow>
        <SettingRow label="Auto Stage on Commit">
          <Toggle value={s.gitAutoStageOnCommit} onChange={v => up('gitAutoStageOnCommit', v)} />
        </SettingRow>

        <SectionHeader title="Layout" />
        <SettingRow label="Default Pane" description="Pane type for new splits">
          <SelectInput value={s.defaultPane} onChange={v => up('defaultPane', v)} options={[
            { value: 'editor', label: 'Editor' }, { value: 'terminal', label: 'Terminal' },
            { value: 'graph', label: 'Graph' }, { value: 'canvas', label: 'Canvas' }, { value: 'kanban', label: 'Kanban' },
          ]} />
        </SettingRow>
        <SettingRow label="Reset Layout" description="Clear saved layout and reload">
          <button onClick={() => { localStorage.removeItem('ghosted:layout'); location.reload() }} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 12, color: 'var(--red)', background: 'var(--bg-elevated)',
          }}>
            Reset Layout
          </button>
        </SettingRow>
      </div>
    </div>
  )
}
