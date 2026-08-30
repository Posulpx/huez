import type { BaseElement } from '../engine/BaseElement'
import { TextElement } from '../elements/TextElement'
import { ShapeElement } from '../elements/ShapeElement'
import { ArtboardElement } from '../elements/ArtboardElement'

/**
 * Per-tool usage registry. Tracks how often a tool is used, whether it is
 * currently active, and a snapshot of the last active element's properties
 * split into SHARED (the common `ElementStyle`) and SPECIFIC (tool/element
 * type details). The tool lister in the sidebar renders from this.
 */

export type PropertyBag = Record<string, string>

export interface ToolRecord {
  id: string
  label: string
  active: boolean
  used: number
  lastUsed: number
  shared: PropertyBag
  specific: PropertyBag
}

const records = new Map<string, ToolRecord>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export function ensureTool(id: string, label: string): ToolRecord {
  let r = records.get(id)
  if (!r) {
    r = {
      id,
      label,
      active: false,
      used: 0,
      lastUsed: 0,
      shared: {},
      specific: {},
    }
    records.set(id, r)
  }
  return r
}

export function setToolActive(
  id: string,
  label: string,
  active: boolean
): void {
  const r = ensureTool(id, label)
  r.active = active
  r.lastUsed = Date.now()
  notify()
}

export function recordToolUsed(id: string, label: string): void {
  const r = ensureTool(id, label)
  r.used += 1
  r.lastUsed = Date.now()
  notify()
}

export function recordToolProps(
  id: string,
  label: string,
  shared: PropertyBag,
  specific: PropertyBag
): void {
  const r = ensureTool(id, label)
  r.shared = shared
  r.specific = specific
  r.lastUsed = Date.now()
  notify()
}

export function getRecords(): ToolRecord[] {
  return [...records.values()]
}

export function subscribeRecords(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Extract shared vs specific properties from any element. */
export function elementProps(el: BaseElement): {
  shared: PropertyBag
  specific: PropertyBag
} {
  const s = el.style
  const shared: PropertyBag = {
    fill: s.fill ?? 'none',
    stroke: s.stroke ?? 'none',
    strokeWidth: String(s.strokeWidth),
    opacity: s.opacity.toFixed(2),
    shadow: s.shadow.enabled ? `on ${s.shadow.blur}px` : 'off',
  }

  const specific: PropertyBag = { type: el.name }
  if (el instanceof ShapeElement || el instanceof ArtboardElement) {
    specific.size = `${Math.round(el.width)}×${Math.round(el.height)}`
    if (el instanceof ShapeElement) specific.kind = el.kind
  } else if (el instanceof TextElement) {
    specific.text = el.text
    specific.fontSize = String(el.fontSize)
  }
  return { shared, specific }
}
