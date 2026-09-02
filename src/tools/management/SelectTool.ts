import type { Tool, ToolContext } from '../Tool'
import type { BaseElement } from '../../engine/BaseElement'
import type { Point } from '../../engine/types'
import {
  hitHandle,
  worldPointRect,
  localPointRect,
  handleEdges,
  type HandleId,
  type Rect,
} from '../../engine/TransformHandles'
import { ShapeElement } from '../../elements/ShapeElement'
import { ArtboardElement } from '../../elements/ArtboardElement'
import { TextElement } from '../../elements/TextElement'
import { PathElement } from '../../elements/PathElement'
import { relayoutChildrenForArtboard } from '../../engine/anchor'
import { logApiCall } from '../log'

interface TransformState {
  mode: 'scale' | 'rotate'
  handle: HandleId
  start: Rect & { fontSize: number }
  startAngle: number
  pathSnapshot?: {
    x: number
    y: number
    hIn: { x: number; y: number } | null
    hOut: { x: number; y: number } | null
  }[]
}

interface GroupTransformState {
  mode: 'scale' | 'rotate'
  handle: HandleId
  startRect: Rect
  startAngle: number
  elements: {
    el: BaseElement
    startRect: Rect
    startRotation: number
    fontSize: number
    pathSnapshot?: {
      x: number
      y: number
      hIn: { x: number; y: number } | null
      hOut: { x: number; y: number } | null
    }[]
  }[]
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
  readonly category: Tool['category'] = 'interaction'

  private dragging = false
  private start: Point | null = null
  private origins = new Map<string, Point>()
  private transform: TransformState | null = null
  private groupTransform: GroupTransformState | null = null
  private groupPreview: {
    rect: Rect
    angle: number
    elements: {
      el: BaseElement
      startRect: Rect
      startRotation: number
      pathSnapshot?: {
        x: number
        y: number
        hIn: { x: number; y: number } | null
        hOut: { x: number; y: number } | null
      }[]
    }[]
  } | null = null
  private groupPreviewRetained = false
  private lastSelectionIds = ''
  private moved = false
  private clonedThisDrag = false
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null =
    null
  private marqueeBase = new Set<string>()

  /** Artboard that the current selection belongs to (null = free/canvas, undefined = empty). */
  private selectionScopeId(
    scene: ToolContext['scene']
  ): string | null | undefined {
    const sel = scene.selected
    if (sel.length === 0) return undefined
    // Scope is defined by the first selected element's artboard. The
    // invariant is that a selection never mixes scopes — enforced in
    // onPointerDown / updateMarqueeSelection — so checking the first is enough.
    return sel[0]!.artboardId
  }

  /** Where a marquee selection is allowed to collect from. */
  private marqueeOriginId(ctx: ToolContext): string | null {
    if (this.marqueeBase.size > 0) {
      const firstId = [...this.marqueeBase][0]!
      const el = ctx.scene.getElementById(firstId)
      return el ? (el.artboardId ?? null) : null
    }
    const m = this.marquee!
    const ab = ctx.scene.artboardAtPoint({ x: m.x0, y: m.y0 })
    return ab ? ab.id : null
  }

  onPointerDown(ctx: ToolContext): void {
    // Retain original group bounds until new selection is made
    const currentSelIds = ctx.scene.selected
      .map((el) => el.id)
      .sort()
      .join(',')
    if (this.groupPreviewRetained && currentSelIds !== this.lastSelectionIds) {
      this.groupPreview = null
      this.groupPreviewRetained = false
      ;(
        ctx.renderer as unknown as {
          setGroupPreview: (r: unknown, a: number) => void
        }
      ).setGroupPreview(null, 0)
    }
    this.lastSelectionIds = currentSelIds
    this.moved = false
    const selected = ctx.scene.selected

    // Intercept handles on a single selection before any move/select.
    if (selected.length === 1 && !selected[0]!.locked) {
      const hit = hitHandle(selected[0]!, ctx.point)
      if (hit) {
        // Artboards cannot be rotated — ignore the rotate handle.
        if (hit === 'rotate' && selected[0] instanceof ArtboardElement) return
        this.beginTransform(ctx, selected[0]!, hit)
        return
      }
    }

    // Group handles for 2+ selection — scale/rotate as one
    if (selected.length > 1) {
      const groupHit = this.hitGroupHandle(ctx)
      if (groupHit) {
        // Don't allow rotate for group containing artboard? Allow but handle artboard rotation lock
        const hasArtboard = selected.some((el) => el instanceof ArtboardElement)
        if (groupHit === 'rotate' && hasArtboard) {
          // Allow group rotate even with artboard? Artboards can't rotate individually, but group can
        }
        this.beginGroupTransform(ctx, groupHit)
        return
      }
    }

    const target = ctx.scene.hitTest(ctx.point)
    if (target) {
      if (!ctx.scene.isSelected(target)) {
        // Confine additive selection to the artboard origin of the current
        // selection. A plain click (replace) is always allowed — it becomes
        // the new origin. Shift-click may only add items from the same scope.
        if (ctx.shiftKey && selected.length > 0) {
          const origin = this.selectionScopeId(ctx.scene)
          if (origin !== undefined && target.artboardId !== origin) {
            // Belongs to another artboard — ignore for selection. We still
            // allow the existing selection to be dragged if the click landed
            // on empty space, but not when it lands on a foreign item.
            return
          }
        }
        ctx.scene.select(target, ctx.shiftKey)
        ctx.scene.updateActiveForElement(target)
        logApiCall(`scene.select`, target.id)
      } else if (ctx.shiftKey) {
        // Shift+click on selected element deselects it
        ctx.scene.deselect(target)
        logApiCall(`scene.deselect`, target.id)
        return
      } else {
        // Click on already selected element still makes its artboard active
        ctx.scene.updateActiveForElement(target)
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
   *  selection for additive (Shift) marquees. The marquee is confined to the
   *  artboard origin of the selection — items from another artboard are never
   *  added. */
  private updateMarqueeSelection(ctx: ToolContext): void {
    const m = this.marquee!
    const l = Math.min(m.x0, m.x1)
    const r = Math.max(m.x0, m.x1)
    const t = Math.min(m.y0, m.y1)
    const b = Math.max(m.y0, m.y1)
    const ids = new Set(this.marqueeBase)
    const originId = this.marqueeOriginId(ctx)
    const insideArtboard = originId !== null

    for (const el of ctx.scene.all) {
      if (el.locked) continue
      if (el instanceof ArtboardElement) {
        // Artboards are only selectable when the marquee origin is free (null).
        // A marquee confined to an artboard selects only that artboard's contents.
        if (insideArtboard) continue
      } else {
        // Non-artboard items must belong to the marquee's origin scope.
        if (el.artboardId !== originId) continue
      }
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
    ctx.history?.push()
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

  private groupRect(scene: ToolContext['scene']): Rect | null {
    const sel = scene.selected
    if (sel.length === 0) return null
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const el of sel) {
      const b = el.bounds
      // For Path/Text, use flattened ink directly (already tight, not corners double-count)
      if (el instanceof PathElement || el instanceof TextElement) {
        const flat = (
          el as unknown as {
            flatten?: (steps?: number) => { x: number; y: number }[]
          }
        ).flatten?.(8) as { x: number; y: number }[] | undefined
        if (flat && flat.length > 0) {
          for (const p of flat) {
            let x = p.x
            let y = p.y
            if (el.rotation) {
              const c = Math.cos(el.rotation)
              const s = Math.sin(el.rotation)
              const cx = b.x + b.width / 2
              const cy = b.y + b.height / 2
              const dx = p.x - cx
              const dy = p.y - cy
              x = dx * c - dy * s + cx
              y = dx * s + dy * c + cy
            }
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
          }
          continue
        }
      }
      // For Shape/Artboard: use world corners with rotation
      const corners = [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
        { x: b.x, y: b.y + b.height },
      ]
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      for (const pt of corners) {
        let x = pt.x
        let y = pt.y
        if (el.rotation) {
          const c = Math.cos(el.rotation)
          const s = Math.sin(el.rotation)
          const dx = pt.x - cx
          const dy = pt.y - cy
          x = dx * c - dy * s + cx
          y = dx * s + dy * c + cy
        }
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    if (!isFinite(minX)) return null
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, rotation: 0 }
  }

  private hitGroupHandle(ctx: ToolContext): HandleId | null {
    const g = this.groupRect(ctx.scene)
    if (!g) return null
    // Reuse handlePoints logic but for group rect
    const pts = ((): { id: HandleId; x: number; y: number }[] => {
      const r = g
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const local = [
        { id: 'nw' as HandleId, x: 0, y: 0 },
        { id: 'n' as HandleId, x: r.w / 2, y: 0 },
        { id: 'ne' as HandleId, x: r.w, y: 0 },
        { id: 'e' as HandleId, x: r.w, y: r.h / 2 },
        { id: 'se' as HandleId, x: r.w, y: r.h },
        { id: 's' as HandleId, x: r.w / 2, y: r.h },
        { id: 'sw' as HandleId, x: 0, y: r.h },
        { id: 'w' as HandleId, x: 0, y: r.h / 2 },
        { id: 'rotate' as HandleId, x: r.w / 2, y: -28 },
      ]
      return local.map((h) => {
        let dx = h.x - r.w / 2
        let dy = h.y - r.h / 2
        if (r.rotation) {
          const c = Math.cos(r.rotation)
          const s = Math.sin(r.rotation)
          const rx = dx * c - dy * s
          const ry = dx * s + dy * c
          dx = rx
          dy = ry
        }
        return { id: h.id, x: dx + cx, y: dy + cy }
      })
    })()
    const hitR = 8 / (ctx.renderer.scale || 1)
    for (const h of pts) {
      const dx = ctx.point.x - h.x
      const dy = ctx.point.y - h.y
      if (dx * dx + dy * dy <= hitR * hitR) return h.id
    }
    return null
  }

  private beginGroupTransform(ctx: ToolContext, handle: HandleId): void {
    // Clear retained preview from previous transform (redraw only on new selection, but new transform should start fresh)
    if (this.groupPreviewRetained) {
      this.groupPreview = null
      this.groupPreviewRetained = false
      ;(
        ctx.renderer as unknown as {
          setGroupPreview: (r: unknown, a: number) => void
        }
      ).setGroupPreview(null, 0)
    }
    // For rotate preview, don't push yet (push on commit), for scale push now (live)
    if (handle !== 'rotate') ctx.history?.push()
    const g = this.groupRect(ctx.scene)
    if (!g) return
    const startAngle =
      handle === 'rotate'
        ? Math.atan2(
            ctx.point.y - (g.y + g.h / 2),
            ctx.point.x - (g.x + g.w / 2)
          )
        : 0
    const elements = ctx.scene.selected.map((el) => {
      const b = el.bounds
      return {
        el,
        startRect: {
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          rotation: el.rotation,
        },
        startRotation: el.rotation,
        fontSize: el instanceof TextElement ? el.fontSize : b.height,
        pathSnapshot:
          el instanceof PathElement
            ? el.points.map((p) => ({
                x: p.x,
                y: p.y,
                hIn: p.hIn ? { x: p.hIn.x, y: p.hIn.y } : null,
                hOut: p.hOut ? { x: p.hOut.x, y: p.hOut.y } : null,
              }))
            : undefined,
      }
    })
    this.groupTransform = {
      mode: handle === 'rotate' ? 'rotate' : 'scale',
      handle,
      startRect: g,
      startAngle,
      elements,
    }
    logApiCall(
      `select.group-${handle === 'rotate' ? 'rotate' : 'scale'}`,
      handle
    )
    ctx.requestRender()
  }

  private beginTransform(
    ctx: ToolContext,
    el: BaseElement,
    handle: HandleId
  ): void {
    // Artboards are axis-aligned — no rotation handle.
    if (handle === 'rotate' && el instanceof ArtboardElement) return
    ctx.history?.push()
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
    const pathSnapshot =
      el instanceof PathElement
        ? el.points.map((p) => ({
            x: p.x,
            y: p.y,
            hIn: p.hIn ? { x: p.hIn.x, y: p.hIn.y } : null,
            hOut: p.hOut ? { x: p.hOut.x, y: p.hOut.y } : null,
          }))
        : undefined
    this.transform = {
      mode: handle === 'rotate' ? 'rotate' : 'scale',
      handle,
      start,
      startAngle,
      pathSnapshot,
    }
    logApiCall(`select.${handle === 'rotate' ? 'rotate' : 'scale'}`, handle)
    ctx.requestRender()
  }

  onPointerMove(ctx: ToolContext): void {
    if (this.groupTransform) {
      this.updateGroupTransform(ctx)
      return
    }
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
      // Artboards cannot be rotated.
      if (el instanceof ArtboardElement) return
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
    } else if (el instanceof PathElement) {
      // Scale every anchor and its handles from the snapshot bounds to new
      // bounds in the element's rotated local frame — using the snapshot avoids
      // compounding (non-linear) drift when the handle is dragged continuously.
      const oldRect = t.start
      const newRect: Rect = {
        x: nx,
        y: ny,
        w: useNw,
        h: useNh,
        rotation: el.rotation,
      }
      const w0 = oldRect.w
      const h0 = oldRect.h
      const sx = w0 === 0 ? 1 : useNw / w0
      const sy = h0 === 0 ? 1 : useNh / h0
      const snap =
        t.pathSnapshot ??
        el.points.map((p) => ({
          x: p.x,
          y: p.y,
          hIn: p.hIn ? { ...p.hIn } : null,
          hOut: p.hOut ? { ...p.hOut } : null,
        }))
      for (let i = 0; i < el.points.length; i++) {
        const a = el.points[i]!
        const s = snap[i]!
        const lp = localPointRect(oldRect, { x: s.x, y: s.y })
        const wp = worldPointRect(newRect, lp.x * sx, lp.y * sy)
        a.x = wp.x
        a.y = wp.y
        if (s.hIn) {
          const lpi = localPointRect(oldRect, s.hIn)
          const wpi = worldPointRect(newRect, lpi.x * sx, lpi.y * sy)
          if (!a.hIn) a.hIn = { x: wpi.x, y: wpi.y }
          else {
            a.hIn.x = wpi.x
            a.hIn.y = wpi.y
          }
        } else a.hIn = null
        if (s.hOut) {
          const lpo = localPointRect(oldRect, s.hOut)
          const wpo = worldPointRect(newRect, lpo.x * sx, lpo.y * sy)
          if (!a.hOut) a.hOut = { x: wpo.x, y: wpo.y }
          else {
            a.hOut.x = wpo.x
            a.hOut.y = wpo.y
          }
        } else a.hOut = null
      }
    }
    if (isArtboard && oldArt) relayoutChildrenForArtboard(ctx.scene, el, oldArt)
    ctx.requestRender()
  }

  private updateGroupTransform(ctx: ToolContext): void {
    const g = this.groupTransform!
    const startRect = g.startRect
    const elements = g.elements

    if (g.mode === 'rotate') {
      const cx = startRect.x + startRect.w / 2
      const cy = startRect.y + startRect.h / 2
      const angle = Math.atan2(ctx.point.y - cy, ctx.point.x - cx)
      let delta = angle - g.startAngle
      if (ctx.shiftKey) {
        delta =
          Math.round((angle - g.startAngle) / (Math.PI / 4)) * (Math.PI / 4)
      }
      // Preview only — store original bounds + delta + elements for complete preview, redraw on release
      this.groupPreview = {
        rect: { ...startRect },
        angle: delta,
        elements: g.elements.map((e) => ({ ...e })),
      }
      ;(
        ctx.renderer as unknown as {
          setGroupPreview: (
            r: Rect | null,
            angle: number,
            els?: {
              el: BaseElement
              startRect: Rect
              startRotation: number
            }[]
          ) => void
        }
      ).setGroupPreview(startRect, delta, g.elements)
      ctx.requestRender()
      return
    }

    // Scale as one
    const w0 = startRect.w
    const h0 = startRect.h
    if (w0 === 0 || h0 === 0) return
    const scx = startRect.x + w0 / 2
    const scy = startRect.y + h0 / 2
    const c = Math.cos(startRect.rotation)
    const s = Math.sin(startRect.rotation)
    const ux = c,
      uy = s
    const vx = -s,
      vy = c
    const aLocal = anchorLocalStart(g.handle, w0, h0)
    const A = worldPointRect(startRect, aLocal.x, aLocal.y)
    const dAx = ctx.point.x - A.x
    const dAy = ctx.point.y - A.y
    const du = dAx * ux + dAy * uy
    const dv = dAx * vx + dAy * vy
    const edges = handleEdges(g.handle)
    const widthFree = edges.west || edges.east
    const heightFree = edges.north || edges.south
    const signX = edges.east ? 1 : edges.west ? -1 : 0
    const signY = edges.south ? 1 : edges.north ? -1 : 0
    const MIN = 4
    let nw = widthFree ? signedClamp(signX * du, MIN) : w0
    let nh = heightFree ? signedClamp(signY * dv, MIN) : h0
    if (ctx.shiftKey && widthFree && heightFree) {
      const f = Math.max(Math.abs(nw) / w0, Math.abs(nh) / h0)
      const sw = nw < 0 ? -1 : 1
      const sh = nh < 0 ? -1 : 1
      nw = w0 * f * sw
      nh = h0 * f * sh
    }
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
    const useNw = nw
    const useNh = nh
    let nx: number, ny: number
    if (ctx.altKey) {
      nx = scx - useNw / 2
      ny = scy - useNh / 2
    } else {
      const anchorAx = edges.east ? -useNw / 2 : edges.west ? useNw / 2 : 0
      const anchorAy = edges.south ? -useNh / 2 : edges.north ? useNh / 2 : 0
      const cx = A.x - (anchorAx * c - anchorAy * s)
      const cy = A.y - (anchorAx * s + anchorAy * c)
      nx = cx - useNw / 2
      ny = cy - useNh / 2
    }
    const newGroup: Rect = { x: nx, y: ny, w: useNw, h: useNh, rotation: 0 }
    const sx = w0 === 0 ? 1 : useNw / w0
    const sy = h0 === 0 ? 1 : useNh / h0

    for (const { el, startRect: r, pathSnapshot } of elements) {
      // Compute element's local position within group
      const elCx = r.x + r.w / 2
      const elCy = r.y + r.h / 2
      // Local pos within group rect
      const lp = localPointRect(startRect, { x: elCx, y: elCy })
      const newElCx = worldPointRect(newGroup, lp.x * sx, lp.y * sy).x
      const newElCy = worldPointRect(newGroup, lp.x * sx, lp.y * sy).y
      // New element bounds
      const newW = r.w * sx
      const newH = r.h * sy
      if (el instanceof ArtboardElement) {
        el.x = newElCx - newW / 2
        el.y = newElCy - newH / 2
        el.width = newW
        el.height = newH
        continue
      }
      if (el instanceof ShapeElement || el instanceof ArtboardElement) {
        el.x = newElCx - newW / 2
        el.y = newElCy - newH / 2
        ;(el as ShapeElement).width = newW
        ;(el as ShapeElement).height = newH
      } else if (el instanceof TextElement) {
        const factor = newH / r.h
        el.fontSize = Math.max(4, (el as TextElement).fontSize * factor)
        el.x = newElCx - newW / 2
        el.y = newElCy - newH / 2
      } else if (el instanceof PathElement) {
        // Scale points from group — keep x/y in sync with new bounds top-left
        const snap = pathSnapshot
        if (!snap) continue
        for (let i = 0; i < el.points.length; i++) {
          const a = el.points[i]!
          const s = snap[i]!
          const lpp = localPointRect(startRect, { x: s.x, y: s.y })
          const wpp = worldPointRect(newGroup, lpp.x * sx, lpp.y * sy)
          a.x = wpp.x
          a.y = wpp.y
          if (s.hIn) {
            const lpi = localPointRect(startRect, s.hIn)
            const wpi = worldPointRect(newGroup, lpi.x * sx, lpi.y * sy)
            if (!a.hIn) a.hIn = { x: wpi.x, y: wpi.y }
            else {
              a.hIn.x = wpi.x
              a.hIn.y = wpi.y
            }
          } else a.hIn = null
          if (s.hOut) {
            const lpo = localPointRect(startRect, s.hOut)
            const wpo = worldPointRect(newGroup, lpo.x * sx, lpo.y * sy)
            if (!a.hOut) a.hOut = { x: wpo.x, y: wpo.y }
            else {
              a.hOut.x = wpo.x
              a.hOut.y = wpo.y
            }
          } else a.hOut = null
        }
        const newB = el.bounds
        ;(el as unknown as { x: number }).x = newB.x
        ;(el as unknown as { y: number }).y = newB.y
      } else {
        // Generic fallback: move and scale via x/y and width/height if any
        const b = el.bounds
        el.moveTo(newElCx - b.width / 2, newElCy - b.height / 2)
        // Try to scale width/height if property exists
        if ('width' in el && 'height' in el) {
          ;(el as unknown as { width: number }).width = newW
          ;(el as unknown as { height: number }).height = newH
        }
      }
    }
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
    if (selected.length > 1) {
      const gHit = this.hitGroupHandle(ctx)
      if (gHit) {
        switch (gHit) {
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
        return
      }
      // Check if hovering over any selected element for move
      for (const el of selected) {
        if (el.hitTest(ctx.point, ctx.renderer.scale)) {
          ctx.setCursor('move')
          return
        }
      }
      ctx.setCursor('default')
      return
    }
    if (selected.length !== 1 || selected[0]!.locked) {
      ctx.setCursor('default')
      return
    }
    let hid = hitHandle(selected[0]!, ctx.point)
    // Artboards have no rotate handle — treat it as no hit.
    if (hid === 'rotate' && selected[0] instanceof ArtboardElement) hid = null
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
    if (this.groupTransform) {
      const isRotatePreview =
        this.groupTransform.mode === 'rotate' && this.groupPreview
      if (isRotatePreview) {
        const g = this.groupTransform
        const startRect = g.startRect
        const cx = startRect.x + startRect.w / 2
        const cy = startRect.y + startRect.h / 2
        const delta = this.groupPreview!.angle
        ctx.history?.push()
        for (const { el, startRect: r, startRotation } of g.elements) {
          if (el instanceof ArtboardElement) continue
          const elCx = r.x + r.w / 2
          const elCy = r.y + r.h / 2
          const dx = elCx - cx
          const dy = elCy - cy
          const c = Math.cos(delta)
          const s = Math.sin(delta)
          const rx = dx * c - dy * s
          const ry = dx * s + dy * c
          const newCx = cx + rx
          const newCy = cy + ry
          el.rotation = startRotation + delta
          if (ctx.shiftKey) {
            el.rotation =
              Math.round(el.rotation / (Math.PI / 4)) * (Math.PI / 4)
          }
          const b = el.bounds
          el.moveTo(newCx - b.width / 2, newCy - b.height / 2)
        }
        // Retain original group bounds until new selection (don't clear preview immediately)
        this.groupPreviewRetained = true
        this.groupTransform = null
        ctx.requestRender()
        return
      }
      // For scale or non-rotate, clear preview and transform already applied live
      this.groupPreview = null
      this.groupPreviewRetained = false
      ;(
        ctx.renderer as unknown as {
          setGroupPreview: (r: unknown, a: number) => void
        }
      ).setGroupPreview(null, 0)
      this.groupTransform = null
      ctx.requestRender()
      return
    }
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
