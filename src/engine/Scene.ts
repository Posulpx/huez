import type { BaseElement } from './BaseElement'
import type { Point } from './types'
import { ArtboardElement } from '../elements/ArtboardElement'

type SceneListener = () => void

/**
 * The scene graph: owns the ordered list of elements, the current
 * selection, and notifies subscribers whenever anything changes so the
 * renderer and UI stay in sync.
 */
export class Scene {
  private elements: BaseElement[] = []
  private selectedIds = new Set<string>()
  private listeners = new Set<SceneListener>()

  get all(): readonly BaseElement[] {
    return this.elements
  }

  get selected(): readonly BaseElement[] {
    return this.elements.filter((e) => this.selectedIds.has(e.id))
  }

  subscribe(fn: SceneListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  add(element: BaseElement): void {
    this.elements.push(element)
    this.emit()
  }

  remove(element: BaseElement): void {
    const i = this.elements.indexOf(element)
    if (i >= 0) {
      this.elements.splice(i, 1)
      this.selectedIds.delete(element.id)
      this.emit()
    }
  }

  clearSelection(): void {
    if (this.selectedIds.size === 0) return
    this.selectedIds.clear()
    this.emit()
  }

  select(element: BaseElement | null, additive = false): void {
    if (!additive) this.selectedIds.clear()
    if (element) this.selectedIds.add(element.id)
    this.emit()
  }

  isSelected(element: BaseElement): boolean {
    return this.selectedIds.has(element.id)
  }

  // ---- Layer / z-order management -------------------------------------

  /** Elements ordered back-to-front (index 0 is the bottom layer). */
  get layers(): readonly BaseElement[] {
    return this.elements
  }

  getElementById(id: string): BaseElement | undefined {
    return this.elements.find((e) => e.id === id)
  }

  /** All artboard containers in the scene. */
  get artboards(): readonly ArtboardElement[] {
    return this.elements.filter(
      (e): e is ArtboardElement => e instanceof ArtboardElement
    )
  }

  /** Topmost artboard whose bounds contain `p`, or null. Used to
   *  auto-assign newly created elements to the artboard under the cursor. */
  artboardAtPoint(p: Point): ArtboardElement | null {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!(el instanceof ArtboardElement)) continue
      const b = el.bounds
      const x0 = Math.min(b.x, b.x + b.width)
      const y0 = Math.min(b.y, b.y + b.height)
      const x1 = Math.max(b.x, b.x + b.width)
      const y1 = Math.max(b.y, b.y + b.height)
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return el
    }
    return null
  }

  indexOf(element: BaseElement): number {
    return this.elements.indexOf(element)
  }

  /** Move an element by `delta` positions in the stack (clamped). */
  moveBy(element: BaseElement, delta: number): void {
    const from = this.elements.indexOf(element)
    if (from < 0) return
    const to = Math.max(0, Math.min(this.elements.length - 1, from + delta))
    if (to === from) return
    this.elements.splice(from, 1)
    this.elements.splice(to, 0, element)
    this.emit()
  }

  bringForward(element: BaseElement): void {
    this.moveBy(element, 1)
  }

  sendBackward(element: BaseElement): void {
    this.moveBy(element, -1)
  }

  bringToFront(element: BaseElement): void {
    const from = this.elements.indexOf(element)
    if (from < 0 || from === this.elements.length - 1) return
    this.elements.splice(from, 1)
    this.elements.push(element)
    this.emit()
  }

  sendToBack(element: BaseElement): void {
    const from = this.elements.indexOf(element)
    if (from <= 0) return
    this.elements.splice(from, 1)
    this.elements.unshift(element)
    this.emit()
  }

  /**
   * Reorder the stack to match `orderedIds` (back-to-front). Unknown or
   * duplicate ids are ignored; missing ids keep their relative order.
   */
  reorder(orderedIds: readonly string[]): void {
    const byId = new Map(this.elements.map((e) => [e.id, e]))
    const next: BaseElement[] = []
    for (const id of orderedIds) {
      const el = byId.get(id)
      if (el) {
        next.push(el)
        byId.delete(id)
      }
    }
    // Append any elements not present in the ordered list (preserve order).
    for (const el of this.elements) {
      if (byId.has(el.id)) next.push(el)
    }
    if (sameOrder(next, this.elements)) return
    this.elements = next
    this.emit()
  }

  setVisible(element: BaseElement, visible: boolean): void {
    if (element.visible === visible) return
    element.visible = visible
    this.emit()
  }

  setLocked(element: BaseElement, locked: boolean): void {
    if (element.locked === locked) return
    element.locked = locked
    if (locked) this.selectedIds.delete(element.id)
    this.emit()
  }

  rename(element: BaseElement, name: string): void {
    element.name = name
    this.emit()
  }

  /** Assign an element to an artboard (or pass null to free it). */
  assignToArtboard(element: BaseElement, artboardId: string | null): void {
    if (element.artboardId === artboardId) return
    element.artboardId = artboardId
    this.emit()
  }

  // --------------------------------------------------------------------

  /**
   * Topmost visible, unlocked element under a point, or null. Artboards
   * are treated as backgrounds: non-artboard elements are tested first so
   * an element sitting on an artboard is selectable instead of the board.
   */
  hitTest(p: Point, scale = 1): BaseElement | null {
    // Label bands are prioritised above everything — an artboard's label is
    // always selectable even when a child element sits on top of it.
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!el.visible || el.locked) continue
      if (el instanceof ArtboardElement && el.hitLabel(p, scale)) return el
    }
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!el.visible || el.locked) continue
      if (el instanceof ArtboardElement) continue
      // Only the exposed (visible) part of an element is selectable: an
      // element clipped to an artboard can't be grabbed through its hidden,
      // clipped-away region.
      if (el.hitTest(p, scale) && this.isExposed(el, p)) return el
    }
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!el.visible || el.locked) continue
      if (el instanceof ArtboardElement && el.hitTest(p, scale)) return el
    }
    return null
  }

  /** True if `p` lies on an element's actually-visible region. A free element
   *  is fully exposed; an element assigned to an artboard is only exposed
   *  within that artboard's (axis-aligned) clip rectangle. */
  private isExposed(el: BaseElement, p: Point): boolean {
    if (!el.artboardId) return true
    const ab = this.getElementById(el.artboardId)
    if (!(ab instanceof ArtboardElement)) return true
    const x0 = Math.min(ab.x, ab.x + ab.width)
    const x1 = Math.max(ab.x, ab.x + ab.width)
    const y0 = Math.min(ab.y, ab.y + ab.height)
    const y1 = Math.max(ab.y, ab.y + ab.height)
    return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  }
}

function sameOrder(
  a: readonly BaseElement[],
  b: readonly BaseElement[]
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false
  }
  return true
}
