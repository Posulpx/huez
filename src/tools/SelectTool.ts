import type { Tool, ToolContext } from './Tool'
import type { BaseElement } from '../engine/BaseElement'
import type { Point } from '../engine/types'
import {
  hitHandle,
  worldPointRect,
  handleEdges,
  type HandleId,
  type Rect,
} from '../engine/TransformHandles'
import { ShapeElement } from '../elements/ShapeElement'
import { ArtboardElement } from '../elements/ArtboardElement'
import { TextElement } from '../elements/TextElement'
import { relayoutChildrenForArtboard } from '../engine/anchor'
import { logApiCall } from './log'

interface TransformState {
  mode: 'scale' | 'rotate'
  handle: HandleId
  start: Rect & { fontSize: number }
  startAngle: number
}

/**
 * Selects elements (click or shift-click to multi-select), drags the
 * current selection, and — on a single selection — drives on-canvas
 * transform controls: scale handles (resize) and a rotate handle.
 *
 * Alt-drag duplicates (Figma / Illustrator style): the originals stay put
 * and a copy is created that follows the cursor. Alt can be held at
 * pointer-down or pressed mid-drag.
 */
export class SelectTool implements Tool {
  readonly id = 'select'
  readonly label = 'Select'
  readonly icon = '▶'
  readonly cursor = 'default'

  private dragging = false
  private start: Point | null = null
  private origins = new Map<string, Point>()
  private transform: TransformState | null = null
  private moved = false
  private clonedThisDrag = false
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null =
    null
  private marqueeBase = new Set<string>()

  onPointerDown(ctx: ToolContext): void {
    this.moved = false
    const selected = ctx.scene.selected

    // Intercept handles on a single selection before any move/select.
    if (selected.length === 1 && !selected[0]!.locked) {
      const hit = hitHandle(selected[0]!, ctx.point)
      if (hit) {
        this.beginTransform(ctx, selected[0]!, hit)
        return
      }
    }

    const target = ctx.scene.hitTest(ctx.point)
    if (target) {
      if (!ctx.scene.isSelected(target)) {
        ctx.scene.select(target, ctx.shiftKey)
        logApiCall(`scene.select`, target.id)
      }
      // An artboard moves only when grabbed by its label. The edges are a
      // select-only handle, so accidental drags of the board are prevented.
      if (
        target instanceof ArtboardElement &&
        !target.hitLabel(ctx.point, ctx.renderer.scale)
      ) {
        return
      }
      // Alt-drag duplicates immediately: clone the selection (and any selected
      // artboard's children) and drag the clone while the original stays put.
      if (ctx.altKey) {
        this.cloneSelection(ctx, 0, 0)
        this.clonedThisDrag = true
        this.beginDrag(ctx)
      } else {
        this.beginDrag(ctx)
      }
    } else {
      // Empty space: start a rubber-band (marquee) group selection.
      this.startMarquee(ctx)
    }
  }

  /** Begin a marquee selection. With Shift the current selection is kept as a
   *  base and the marquee adds to it; without Shift the selection is cleared
   *  immediately (so a plain click still deselects). */
  private startMarquee(ctx: ToolContext): void {
    this.marquee = {
      x0: ctx.point.x,
      y0: ctx.point.y,
      x1: ctx.point.x,
      y1: ctx.point.y,
    }
    this.marqueeBase = new Set(
      ctx.shiftKey ? ctx.scene.selected.map((s) => s.id) : []
    )
    if (!ctx.shiftKey) {
      ctx.scene.clearSelection()
      logApiCall(`scene.clearSelection`)
    }
    ctx.renderer.setMarquee(this.marquee)
    ctx.requestRender()
  }

  /** Recompute the selection from the marquee rectangle: every (unlocked)
   *  element whose bounds intersect the marquee is selected, plus the base
   *  selection for additive (Shift) marquees. */
  private updateMarqueeSelection(ctx: ToolContext): void {
    const m = this.marquee!
    const l = Math.min(m.x0, m.x1)
    const r = Math.max(m.x0, m.x1)
    const t = Math.min(m.y0, m.y1)
    const b = Math.max(m.y0, m.y1)
    const ids = new Set(this.marqueeBase)
    // If the marquee was started inside an artboard, it's a "select contents"
    // gesture — exclude artboards themselves so only their contents get
    // selected. Marquees started in free space can still select artboards.
    const insideArtboard = ctx.scene.artboards.some((a) => {
      const ax0 = Math.min(a.x, a.x + a.width)
      const ax1 = Math.max(a.x, a.x + a.width)
      const ay0 = Math.min(a.y, a.y + a.height)
      const ay1 = Math.max(a.y, a.y + a.height)
      return m.x0 >= ax0 && m.x0 <= ax1 && m.y0 >= ay0 && m.y0 <= ay1
    })
    for (const el of ctx.scene.all) {
      if (el instanceof ArtboardElement && insideArtboard) continue
      if (el.locked) continue
      // A marquee started in free space selects only free objects and
      // artboards — contents assigned to an artboard stay out of scope.
      if (!insideArtboard && el.artboardId !== null) continue
      const eb = el.bounds
      const elL = Math.min(eb.x, eb.x + eb.width)
      const elR = Math.max(eb.x, eb.x + eb.width)
      const elT = Math.min(eb.y, eb.y + eb.height)
      const elB = Math.max(eb.y, eb.y + eb.height)
      if (elR > l && elL < r && elB > t && elT < b) ids.add(el.id)
    }
    ctx.scene.clearSelection()
    for (const id of ids) {
      const el = ctx.scene.getElementById(id)
      if (el && !el.locked) ctx.scene.select(el, true)
    }
  }

  /** Duplicate the current selection (and an artboard's assigned children)
   *  into the scene, offset by (offsetX, offsetY), and select only the
   *  top-level clones. The originals are left untouched. */
  private cloneSelection(
    ctx: ToolContext,
    offsetX: number,
    offsetY: number
  ): void {
    const sources = [...ctx.scene.selected]
    const top: BaseElement[] = []
    for (const src of sources) {
      const clone = src.clone()
      clone.moveTo(clone.x + offsetX, clone.y + offsetY)
      ctx.scene.add(clone)
      top.push(clone)
      // An artboard's children are cloned too and reassigned to the new
      // artboard, but kept out of the top-level selection.
      if (src instanceof ArtboardElement) {
        for (const child of ctx.scene.all) {
          if (
            child.artboardId === src.id &&
            !(child instanceof ArtboardElement)
          ) {
            const cc = child.clone()
            cc.artboardId = clone.id
            cc.moveTo(cc.x + offsetX, cc.y + offsetY)
            ctx.scene.add(cc)
          }
        }
      }
    }
    ctx.scene.clearSelection()
    for (const c of top) ctx.scene.select(c, true)
    logApiCall('scene.duplicate', `${top.length}`)
  }

  private beginDrag(ctx: ToolContext): void {
    this.dragging = true
    this.start = { ...ctx.point }
    this.origins.clear()
    for (const el of ctx.scene.selected) {
      this.origins.set(el.id, { x: el.x, y: el.y })
      // Children assigned to a selected artboard move with it.
      if (el instanceof ArtboardElement) {
        for (const child of ctx.scene.all) {
          if (child.artboardId === el.id && !this.origins.has(child.id)) {
            this.origins.set(child.id, { x: child.x, y: child.y })
          }
        }
      }
    }
  }

  private beginTransform(
    ctx: ToolContext,
    el: BaseElement,
    handle: HandleId
  ): void {
    const b = el.bounds
    const start: Rect & { fontSize: number } = {
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      rotation: el.rotation,
      fontSize: el instanceof TextElement ? el.fontSize : b.height,
    }
    let startAngle = 0
    if (handle === 'rotate') {
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      startAngle = Math.atan2(ctx.point.y - cy, ctx.point.x - cx)
    }
    this.transform = {
      mode: handle === 'rotate' ? 'rotate' : 'scale',
      handle,
      start,
      startAngle,
    }
    logApiCall(`select.${handle === 'rotate' ? 'rotate' : 'scale'}`, handle)
    ctx.requestRender()
  }

  onPointerMove(ctx: ToolContext): void {
    if (this.transform) {
      this.updateTransform(ctx)
      return
    }
    if (this.marquee) {
      this.marquee.x1 = ctx.point.x
      this.marquee.y1 = ctx.point.y
      ctx.renderer.setMarquee(this.marquee)
      this.updateMarqueeSelection(ctx)
      ctx.requestRender()
      return
    }
    if (this.dragging && this.start) {
      this.moved = true
      // Pressing Alt mid-drag duplicates: the original snaps back to where it
      // started and a copy (already offset by the current drag delta) follows.
      if (ctx.altKey && !this.clonedThisDrag) {
        const dx = ctx.point.x - this.start.x
        const dy = ctx.point.y - this.start.y
        for (const [id, o] of this.origins) {
          const el = ctx.scene.getElementById(id)
          if (el) el.moveTo(o.x, o.y)
        }
        this.cloneSelection(ctx, dx, dy)
        this.clonedThisDrag = true
        this.beginDrag(ctx)
        ctx.requestRender()
        return
      }
      let dx = ctx.point.x - this.start.x
      let dy = ctx.point.y - this.start.y
      // Shift: constrain the drag direction to 45° increments (incl. 0/90°).
      if (ctx.shiftKey) {
        const mag = Math.hypot(dx, dy)
        if (mag > 0) {
          const ang = Math.atan2(dy, dx)
          const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
          dx = Math.cos(snapped) * mag
          dy = Math.sin(snapped) * mag
        }
      }
      for (const [id, o] of this.origins) {
        const el = ctx.scene.getElementById(id)
        if (el) el.moveTo(o.x + dx, o.y + dy)
      }
      // Live reassignment: the cursor position (not the element center)
      // decides which artboard the dragged element belongs to.
      this.reassignByCursor(ctx)
      ctx.requestRender()
      return
    }
    this.updateHoverCursor(ctx)
  }

  private updateTransform(ctx: ToolContext): void {
    const t = this.transform!
    const el = ctx.scene.selected[0]
    if (!el) return

    // Capture the artboard's rect before mutating, so assigned children can
    // be re-anchored relative to the new rect (resize/rotate).
    const isArtboard = el instanceof ArtboardElement
    const oldArt = isArtboard
      ? { x: el.x, y: el.y, w: el.width, h: el.height, rotation: el.rotation }
      : null

    if (t.mode === 'rotate') {
      const cx = t.start.x + t.start.w / 2
      const cy = t.start.y + t.start.h / 2
      const angle = Math.atan2(ctx.point.y - cy, ctx.point.x - cx)
      el.rotation = t.start.rotation + (angle - t.startAngle)
      // Shift: snap rotation to 45° increments (0°, 45°, 90°, …).
      if (ctx.shiftKey) {
        el.rotation = Math.round(el.rotation / (Math.PI / 4)) * (Math.PI / 4)
      }
      if (isArtboard && oldArt)
        relayoutChildrenForArtboard(ctx.scene, el, oldArt)
      ctx.requestRender()
      return
    }

    // Scale: resize about the anchor opposite the dragged handle, in the
    // element's rotated local frame, so handles stay glued to the cursor
    // for any rotation. Supports Shift (ratio lock) and Alt (center pivot).
    const rot = t.start.rotation
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    const ux = c,
      uy = s // width axis in world space
    const vx = -s,
      vy = c // height axis in world space
    const w0 = t.start.w
    const h0 = t.start.h
    const scx = t.start.x + w0 / 2
    const scy = t.start.y + h0 / 2

    // Anchor (opposite the dragged handle) in world space, from the START rect.
    const aLocal = anchorLocalStart(t.handle, w0, h0)
    const A = worldPointRect(t.start, aLocal.x, aLocal.y)
    const dAx = ctx.point.x - A.x
    const dAy = ctx.point.y - A.y
    const du = dAx * ux + dAy * uy // cursor delta along width
    const dv = dAx * vx + dAy * vy // cursor delta along height

    const edges = handleEdges(t.handle)
    const widthFree = edges.west || edges.east
    const heightFree = edges.north || edges.south
    const signX = edges.east ? 1 : edges.west ? -1 : 0
    const signY = edges.south ? 1 : edges.north ? -1 : 0

    const MIN = 4
    let nw = widthFree ? signedClamp(signX * du, MIN) : w0
    let nh = heightFree ? signedClamp(signY * dv, MIN) : h0

    // Shift: ratio lock (corners only) — keep aspect, anchor stays fixed.
    if (ctx.shiftKey && widthFree && heightFree) {
      const f = Math.max(Math.abs(nw) / w0, Math.abs(nh) / h0)
      const sw = nw < 0 ? -1 : 1
      const sh = nh < 0 ? -1 : 1
      nw = w0 * f * sw
      nh = h0 * f * sh
    }

    // Alt: center pivot — symmetric stretch about the start center.
    if (ctx.altKey) {
      const dCx = ctx.point.x - scx
      const dCy = ctx.point.y - scy
      const duC = dCx * ux + dCy * uy
      const dvC = dCx * vx + dCy * vy
      nw = widthFree ? signedClamp(2 * duC, MIN) : w0
      nh = heightFree ? signedClamp(2 * dvC, MIN) : h0
      if (ctx.shiftKey && widthFree && heightFree) {
        const f = Math.max(Math.abs(2 * duC) / w0, Math.abs(2 * dvC) / h0)
        nw = w0 * f * (nw < 0 ? -1 : 1)
        nh = h0 * f * (nh < 0 ? -1 : 1)
      }
    }

    nw = signedClamp(nw, MIN)
    nh = signedClamp(nh, MIN)

    // Artboards never flip: force positive extents (no negative scaling).
    if (el instanceof ArtboardElement) {
      nw = Math.max(MIN, Math.abs(nw))
      nh = Math.max(MIN, Math.abs(nh))
    }

    // Text can't mirror, so it resizes with absolute extents (no flip).
    const useNw = el instanceof TextElement ? Math.abs(nw) : nw
    const useNh = el instanceof TextElement ? Math.abs(nh) : nh

    let nx: number, ny: number
    if (ctx.altKey) {
      nx = scx - useNw / 2
      ny = scy - useNh / 2
    } else {
      // Keep the opposite handle anchored at its original world position.
      const anchorAx = edges.east ? -useNw / 2 : edges.west ? useNw / 2 : 0
      const anchorAy = edges.south ? -useNh / 2 : edges.north ? useNh / 2 : 0
      const cx = A.x - (anchorAx * c - anchorAy * s)
      const cy = A.y - (anchorAx * s + anchorAy * c)
      nx = cx - useNw / 2
      ny = cy - useNh / 2
    }

    el.x = nx
    el.y = ny

    if (el instanceof ShapeElement || el instanceof ArtboardElement) {
      el.width = nw // signed: a negative value means the object is flipped
      el.height = nh
    } else if (el instanceof TextElement) {
      const factor = useNh / t.start.h
      el.fontSize = Math.max(4, t.start.fontSize * factor)
    }
    if (isArtboard && oldArt) relayoutChildrenForArtboard(ctx.scene, el, oldArt)
    ctx.requestRender()
  }

  private updateHoverCursor(ctx: ToolContext): void {
    // Crossed-arrows (move) cursor whenever the pointer is over an artboard's
    // label/edge handle — its move affordance. If that exact artboard is the
    // single selected element we fall through, so its resize handles still
    // show their resize cursors.
    const hovering = ctx.scene.hitTest(ctx.point, ctx.renderer.scale)
    if (hovering instanceof ArtboardElement) {
      const sel = ctx.scene.selected
      if (!(sel.length === 1 && sel[0] === hovering)) {
        ctx.setCursor('move')
        return
      }
    }
    const selected = ctx.scene.selected
    if (selected.length !== 1 || selected[0]!.locked) {
      ctx.setCursor('default')
      return
    }
    const hid = hitHandle(selected[0]!, ctx.point)
    if (!hid) {
      ctx.setCursor('move')
      return
    }
    switch (hid) {
      case 'rotate':
        ctx.setCursor('grab')
        break
      case 'nw':
      case 'se':
        ctx.setCursor('nwse-resize')
        break
      case 'ne':
      case 'sw':
        ctx.setCursor('nesw-resize')
        break
      case 'n':
      case 's':
        ctx.setCursor('ns-resize')
        break
      default:
        ctx.setCursor('ew-resize')
    }
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.transform) {
      this.transform = null
      return
    }
    if (this.marquee) {
      ctx.renderer.setMarquee(null)
      this.marquee = null
      this.marqueeBase.clear()
      this.resetDragState(ctx)
      ctx.requestRender()
      return
    }
    if (this.dragging && this.moved) {
      // Final reassignment based on the cursor position at drop time.
      this.reassignByCursor(ctx)
    }
    this.resetDragState(ctx)
  }

  /** Clears all drag/preview state. */
  private resetDragState(_ctx: ToolContext): void {
    this.dragging = false
    this.start = null
    this.origins.clear()
    this.clonedThisDrag = false
  }

  /** Reassign the dragged (selected, non-artboard) elements to the artboard
   *  under the cursor, or free them if the cursor is outside any artboard.
   *  The assignment basis is the cursor position — not the element center. */
  private reassignByCursor(ctx: ToolContext): void {
    const target = this.artboardUnderPoint(ctx.point, ctx.scene)
    const nextId = target ? target.id : null
    for (const el of ctx.scene.selected) {
      if (el instanceof ArtboardElement) continue
      if (el.artboardId !== nextId) {
        ctx.scene.assignToArtboard(el, nextId)
        logApiCall('scene.assign', `${el.id} → ${nextId ?? 'free'}`)
      }
    }
  }

  private artboardUnderPoint(
    p: Point,
    scene: ToolContext['scene']
  ): ArtboardElement | null {
    const arts = scene.artboards
    for (let i = arts.length - 1; i >= 0; i--) {
      const a = arts[i]!
      const x0 = Math.min(a.x, a.x + a.width)
      const x1 = Math.max(a.x, a.x + a.width)
      const y0 = Math.min(a.y, a.y + a.height)
      const y1 = Math.max(a.y, a.y + a.height)
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return a
    }
    return null
  }
}

/** Top-left-origin local coordinate of the anchor (handle OPPOSITE the
 *  dragged one) within the element's unrotated start rect. */
function anchorLocalStart(
  id: HandleId,
  w: number,
  h: number
): { x: number; y: number } {
  switch (id) {
    case 'se':
      return { x: 0, y: 0 } // anchor nw
    case 'nw':
      return { x: w, y: h } // anchor se
    case 'ne':
      return { x: 0, y: h } // anchor sw
    case 'sw':
      return { x: w, y: 0 } // anchor ne
    case 's':
      return { x: w / 2, y: 0 } // anchor n
    case 'n':
      return { x: w / 2, y: h } // anchor s
    case 'e':
      return { x: 0, y: h / 2 } // anchor w
    case 'w':
      return { x: w, y: h / 2 } // anchor e
    default:
      return { x: 0, y: 0 }
  }
}

/** Clamp magnitude to at least `min` while preserving the sign, so a size
 *  can cross zero and become negative (a flipped element) instead of being
 *  forced back to a positive minimum. */
function signedClamp(v: number, min: number): number {
  if (v >= 0) return Math.max(min, v)
  return Math.min(-min, v)
}
