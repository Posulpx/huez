import type { Scene } from '../engine/Scene'
import type { CanvasRenderer } from '../engine/CanvasRenderer'
import type { Point } from '../engine/types'
import { PathElement } from '../elements/PathElement'

/**
 * Path vertex editing controller. Enters edit mode on double-click of a
 * `PathElement` and allows direct manipulation of anchors and Bézier handles.
 *
 * - Drag an anchor square to move the point (handles follow).
 * - Drag a handle circle to reshape the curve.
 * - Click on the stroke to insert a new anchor at the closest point.
 * - Double-click an anchor to delete it (needs ≥ 2 points to keep valid).
 * - Enter / Escape to finish; Delete / Backspace to remove selected anchor.
 */
export class PathEditor {
  private editingPath: PathElement | null = null
  private drag: { index: number; kind: 'anchor' | 'hIn' | 'hOut' } | null = null

  constructor(
    private scene: Scene,
    _renderer: CanvasRenderer,
    private requestRender: () => void
  ) {
    void _renderer
  }

  isEditing(path?: PathElement): boolean {
    if (!path) return !!this.editingPath
    return this.editingPath === path
  }

  get editing(): PathElement | null {
    return this.editingPath
  }

  startEdit(path: PathElement): void {
    if (this.editingPath === path) return
    this.cancel()
    this.editingPath = path
    path.editing = true
    path.editingSelected = path.points.length > 0 ? 0 : -1
    this.scene.select(path)
    this.requestRender()
  }

  commit(): void {
    if (!this.editingPath) return
    const p = this.editingPath
    p.editing = false
    p.editingSelected = -1
    this.editingPath = null
    this.drag = null
    this.requestRender()
  }

  cancel(): void {
    // For paths we treat cancel same as commit (no draft to discard)
    this.commit()
  }

  /** Returns true if the event was consumed (path handle/anchor or insert). */
  handlePointerDown(world: Point, scale: number): boolean {
    const path = this.editingPath
    if (!path) return false

    const hit = path.hitAnchor(world, scale)
    if (hit) {
      path.editingSelected = hit.index
      this.drag = { index: hit.index, kind: hit.kind }
      this.requestRender()
      return true
    }

    // Click on stroke → insert new anchor
    const info = path.closestSegmentInfo(world, scale)
    if (info) {
      const idx = path.insertAnchorAtVisual(info.projected, info.segmentIndex)
      path.editingSelected = idx
      this.drag = { index: idx, kind: 'anchor' }
      this.requestRender()
      return true
    }

    // Click elsewhere while editing — keep editing but don't consume so
    // the underlying tool can decide; caller may choose to commit elsewhere.
    return false
  }

  handlePointerMove(world: Point): boolean {
    const path = this.editingPath
    const d = this.drag
    if (!path || !d) return false
    const anchor = path.points[d.index]
    if (!anchor) return false

    const stored = path.worldToStored(world)

    if (d.kind === 'anchor') {
      const dx = stored.x - anchor.x
      const dy = stored.y - anchor.y
      anchor.x = stored.x
      anchor.y = stored.y
      // Handles follow the anchor to keep their offset (unless null)
      if (anchor.hIn) {
        anchor.hIn.x += dx
        anchor.hIn.y += dy
      }
      if (anchor.hOut) {
        anchor.hOut.x += dx
        anchor.hOut.y += dy
      }
      // Keep x,y of element in sync? PathElement bounds derived from points,
      // but x,y field is used for moveTo offset. No need to update x,y here;
      // bounds will hug new points. Keep path.x/y near first point for
      // consistency if needed.
    } else if (d.kind === 'hIn') {
      anchor.hIn = { x: stored.x, y: stored.y }
    } else if (d.kind === 'hOut') {
      anchor.hOut = { x: stored.x, y: stored.y }
    }
    this.requestRender()
    return true
  }

  handlePointerUp(): boolean {
    if (!this.drag) return false
    this.drag = null
    this.requestRender()
    return true
  }

  /** Double-click on an anchor deletes it; returns true if consumed. */
  handleDoubleClick(world: Point, scale: number): boolean {
    const path = this.editingPath
    if (!path) return false
    const hit = path.hitAnchor(world, scale)
    if (hit && hit.kind === 'anchor') {
      if (path.points.length <= 2) return true // keep at least 2 points
      path.removeAnchor(hit.index)
      path.editingSelected = -1
      this.drag = null
      this.requestRender()
      return true
    }
    return false
  }

  handleKeyDown(key: string): boolean {
    const path = this.editingPath
    if (!path) return false
    if (key === 'Enter' || key === 'Escape') {
      this.commit()
      return true
    }
    if (key === 'Delete' || key === 'Backspace') {
      const sel = path.editingSelected
      if (sel >= 0 && path.points.length > 2) {
        path.removeAnchor(sel)
        path.editingSelected = -1
        this.requestRender()
        return true
      }
      // If no explicit selection but hit test would allow, ignore
      return true
    }
    if (key === 'c' || key === 'C') {
      // Toggle closed
      path.closed = !path.closed
      this.requestRender()
      return true
    }
    return false
  }

  /** Hint cursor while editing. */
  updateCursor(world: Point, scale: number): string | null {
    const path = this.editingPath
    if (!path) return null
    const hit = path.hitAnchor(world, scale)
    if (hit) {
      if (hit.kind === 'anchor') return 'move'
      return 'pointer'
    }
    const info = path.closestSegmentInfo(world, scale)
    if (info) return 'copy' // add point
    return 'default'
  }
}
