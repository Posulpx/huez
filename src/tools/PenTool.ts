import type { Tool, ToolContext } from './Tool'
import type { Point } from '../engine/types'
import { PathElement } from '../elements/PathElement'
import { logApiCall } from './log'

/**
 * Pen tool (Illustrator / Figma style). Click to drop corner anchors; click
 * and drag to pull out mirrored B├⌐zier handles for a smooth point. Click the
 * first anchor again to close the path. Press Enter to finish an open path
 * (also finishes when you switch tools), Escape to cancel. The path is added
 * to the scene immediately and committed when the gesture ends.
 *
 * Node awareness: when active, highlights open endpoints of any open path
 * where the pen can continue.
 */
export class PenTool implements Tool {
  readonly id = 'pen'
  readonly label = 'Pen'
  readonly icon = '🖋️'
  readonly cursor = 'crosshair'
  readonly category: Tool['category'] = 'geometry'

  private path: PathElement | null = null
  private activeIndex = -1
  private dragging = false
  private dragStart: Point | null = null
  private closing = false
  private closingOrigin: { hIn: Point | null; hOut: Point | null } | null = null
  private closingTargetIndex: number | null = null
  private closingHandleKind: 'hIn' | 'hOut' | null = null
  private resumeSnapshot: {
    points: import('../elements/PathElement').PathAnchor[]
    closed: boolean
  } | null = null
  private hoveredEndpoint: { path: PathElement; index: number } | null = null
  private resumeEnd: 'start' | 'end' | null = null

  getHoveredEndpoint(): { path: PathElement; index: number } | null {
    return this.hoveredEndpoint
  }

  /** Find nearest open endpoint (start or end of any open path) within threshold. */
  private findOpenEndpointNear(
    p: Point,
    scale: number,
    scene: ToolContext['scene']
  ): { path: PathElement; index: number } | null {
    const thresh = 8 / (scale > 0 ? scale : 1)
    let best: { path: PathElement; index: number; dist: number } | null = null
    for (const el of scene.all) {
      if (!(el instanceof PathElement)) continue
      if (el.closed || el.drafting) continue
      if (el.points.length === 0) continue
      const first = el.points[0]!
      const last = el.points[el.points.length - 1]!
      const firstVis = el.storedToWorld({ x: first.x, y: first.y })
      const lastVis = el.storedToWorld({ x: last.x, y: last.y })
      const dFirst = Math.hypot(p.x - firstVis.x, p.y - firstVis.y)
      const dLast = Math.hypot(p.x - lastVis.x, p.y - lastVis.y)
      if (dFirst <= thresh && (!best || dFirst < best.dist)) {
        best = { path: el, index: 0, dist: dFirst }
      }
      if (dLast <= thresh && (!best || dLast < best.dist)) {
        best = { path: el, index: el.points.length - 1, dist: dLast }
      }
    }
    return best ? { path: best.path, index: best.index } : null
  }

  onActivate(ctx: ToolContext): void {
    ctx.renderer.setPenActive(true)
    this.hoveredEndpoint = null
    ;(
      ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
    ).setPenHover(null)
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.renderer.setPenActive(false)
    ;(
      ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
    ).setPenHover(null)
    this.hoveredEndpoint = null
    if (this.path) {
      if (this.path.points.length >= 2) this.finish(ctx)
      else this.cancel(ctx)
    }
  }

  onPointerDown(ctx: ToolContext): void {
    const p = ctx.point

    // Start a new path, or resume an open-ended path from its endpoint (node awareness ΓÇö any open path, not just selected).
    if (!this.path) {
      const hit = this.findOpenEndpointNear(p, ctx.renderer.scale, ctx.scene)
      if (hit) {
        const cand = hit.path
        this.path = cand
        this.path.drafting = true
        this.resumeSnapshot = {
          points: cand.points.map((pt) => ({
            x: pt.x,
            y: pt.y,
            hIn: pt.hIn ? { x: pt.hIn.x, y: pt.hIn.y } : null,
            hOut: pt.hOut ? { x: pt.hOut.x, y: pt.hOut.y } : null,
          })),
          closed: cand.closed,
        }
        this.resumeEnd = hit.index === 0 ? 'start' : 'end'
        cand.resumeEnd = this.resumeEnd
        this.activeIndex = hit.index
        this.dragging = false
        this.dragStart = null
        this.path.cursor = p
        this.path.editing = false
        ctx.scene.select(cand, false)
        this.hoveredEndpoint = null
        ;(
          ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
        ).setPenHover(null)
        ctx.requestRender()
        return
      }
      const path = new PathElement(p.x, p.y)
      path.drafting = true
      // Auto-assign to artboard under creation point, if any.
      const ab = ctx.scene.artboardAtPoint(p)
      if (ab) path.artboardId = ab.id
      this.activeIndex = path.addAnchor(p)
      ctx.scene.add(path)
      this.path = path
      this.dragging = true
      this.dragStart = p
      path.cursor = p
      ctx.requestRender()
      return
    }

    // Close the path if we click near an endpoint (first or last) with >=2 points.
    // Allow handle positioning until mouse up ΓÇö preserve target node's opposite handle.
    const scale = ctx.renderer.scale
    const closeDist = 8 / (scale > 0 ? scale : 1)
    const first = this.path.points[0]!
    const last = this.path.points[this.path.points.length - 1]!
    const firstWorld = first ? { x: first.x, y: first.y } : null
    const lastWorld = last ? { x: last.x, y: last.y } : null
    let closeTarget: {
      index: number
      kind: 'hIn' | 'hOut'
      origin: { hIn: Point | null; hOut: Point | null }
    } | null = null
    if (this.path.points.length >= 2 && firstWorld) {
      const dFirst = Math.hypot(p.x - firstWorld.x, p.y - firstWorld.y)
      if (dFirst <= closeDist) {
        closeTarget = {
          index: 0,
          kind: 'hIn',
          origin: {
            hIn: first.hIn ? { x: first.hIn.x, y: first.hIn.y } : null,
            hOut: first.hOut ? { x: first.hOut.x, y: first.hOut.y } : null,
          },
        }
      } else if (lastWorld) {
        const dLast = Math.hypot(p.x - lastWorld.x, p.y - lastWorld.y)
        if (dLast <= closeDist) {
          // For open path, clicking near last when already at last is not close; but for resumed start, closing to last
          // Only allow close to last if not already at that endpoint (avoid immediate close when resuming)
          // For now, allow close to last as well for generic awareness
          closeTarget = {
            index: this.path.points.length - 1,
            kind: 'hOut',
            origin: {
              hIn: last.hIn ? { x: last.hIn.x, y: last.hIn.y } : null,
              hOut: last.hOut ? { x: last.hOut.x, y: last.hOut.y } : null,
            },
          }
        }
      }
    }
    if (closeTarget) {
      // For new path (resumeEnd null), only close to first is intended; for resumed, allow both
      // To avoid closing immediately when resuming at an endpoint, ensure we are not closing to the same endpoint we are resuming from
      if (this.resumeEnd === 'start' && closeTarget.index === 0) {
        // Resuming at start, clicking near start again should not close to start ΓÇö skip
      } else if (
        this.resumeEnd === 'end' &&
        closeTarget.index === this.path.points.length - 1
      ) {
        // Resuming at end, clicking near end again should not close ΓÇö skip
      } else {
        this.closing = true
        this.dragging = true
        const targetPt = this.path.points[closeTarget.index]!
        this.dragStart = { x: targetPt.x, y: targetPt.y }
        this.activeIndex = closeTarget.index
        this.closingTargetIndex = closeTarget.index
        this.closingHandleKind = closeTarget.kind
        this.closingOrigin = closeTarget.origin
        this.path.closed = true
        this.path.cursor = null
        this.path.closingTarget = {
          index: closeTarget.index,
          kind: closeTarget.kind,
        }
        this.path.closingCursor = { x: p.x, y: p.y }
        this.path.closingHover = null
        ctx.requestRender()
        return
      }
    }

    // Connect to any other open-ended path if near its endpoint
    const otherHit = this.findOpenEndpointNear(p, ctx.renderer.scale, ctx.scene)
    if (otherHit && otherHit.path !== this.path) {
      const other = otherHit.path
      const thisIsStart = this.resumeEnd === 'start'
      const otherIsStart = otherHit.index === 0
      const copyPt = (pt: (typeof other.points)[number]) => ({
        x: pt.x,
        y: pt.y,
        hIn: pt.hIn ? { x: pt.hIn.x, y: pt.hIn.y } : null,
        hOut: pt.hOut ? { x: pt.hOut.x, y: pt.hOut.y } : null,
      })
      const reversePts = (pts: typeof other.points) =>
        [...pts].reverse().map((pt) => ({
          x: pt.x,
          y: pt.y,
          hIn: pt.hOut ? { x: pt.hOut.x, y: pt.hOut.y } : null,
          hOut: pt.hIn ? { x: pt.hIn.x, y: pt.hIn.y } : null,
        }))
      let merged: typeof this.path.points
      let newActiveIndex: number
      let newResumeEnd: 'start' | 'end'
      if (thisIsStart) {
        if (otherIsStart) {
          merged = [...reversePts(other.points), ...this.path.points]
          newActiveIndex = 0
          newResumeEnd = 'start'
        } else {
          merged = [...other.points.map(copyPt), ...this.path.points]
          newActiveIndex = 0
          newResumeEnd = 'start'
        }
      } else {
        if (otherIsStart) {
          merged = [...this.path.points, ...other.points.map(copyPt)]
          newActiveIndex = merged.length - 1
          newResumeEnd = 'end'
        } else {
          merged = [...this.path.points, ...reversePts(other.points)]
          newActiveIndex = merged.length - 1
          newResumeEnd = 'end'
        }
      }
      this.path.points = merged
      this.path.resumeEnd = newResumeEnd
      this.resumeEnd = newResumeEnd
      this.activeIndex = newActiveIndex
      this.path.closingHover = null
      this.path.closingTarget = null
      this.path.closingCursor = null
      ctx.scene.remove(other)
      this.path.cursor =
        newActiveIndex === 0
          ? { x: merged[0]!.x, y: merged[0]!.y }
          : { x: merged[merged.length - 1]!.x, y: merged[merged.length - 1]!.y }
      this.dragging = false
      this.dragStart = null
      ctx.scene.select(this.path, false)
      ctx.requestRender()
      return
    }

    // Otherwise add another anchor.
    if (this.resumeEnd === 'start') {
      // Prepend at beginning
      this.path.points.unshift({ x: p.x, y: p.y, hIn: null, hOut: null })
      this.activeIndex = 0
    } else {
      this.activeIndex = this.path.addAnchor(p)
    }
    this.dragging = true
    this.dragStart = p
    this.path.cursor = p
    ctx.requestRender()
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.path) {
      // Node awareness ΓÇö highlight nearest open endpoint for continuation
      const hit = this.findOpenEndpointNear(
        ctx.point,
        ctx.renderer.scale,
        ctx.scene
      )
      const prevId = this.hoveredEndpoint?.path.id ?? null
      const prevIdx = this.hoveredEndpoint?.index ?? -1
      const curId = hit?.path.id ?? null
      const curIdx = hit?.index ?? -1
      this.hoveredEndpoint = hit
      ;(
        ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
      ).setPenHover(hit ? { pathId: hit.path.id, index: hit.index } : null)
      if (hit) ctx.setCursor('copy')
      else ctx.setCursor(this.cursor)
      if (prevId !== curId || prevIdx !== curIdx) ctx.requestRender()
      return
    }
    if (this.closing) {
      // Preview closed curve directly ΓÇö no rubber band; entry handle tracks cursor
      this.path.cursor = null
      this.path.closingCursor = { x: ctx.point.x, y: ctx.point.y }
      if (
        this.dragging &&
        this.dragStart &&
        this.activeIndex >= 0 &&
        this.closingTargetIndex !== null
      ) {
        const target = this.path.points[this.closingTargetIndex]!
        const cursor = { x: ctx.point.x, y: ctx.point.y }
        const scale = ctx.renderer.scale
        const thresh = 3 / (scale > 0 ? scale : 1)
        const dist = Math.hypot(
          cursor.x - this.dragStart.x,
          cursor.y - this.dragStart.y
        )
        if (this.closingOrigin) {
          // Preserve opposite handle of target
          if (this.closingHandleKind === 'hIn') {
            target.hOut = this.closingOrigin.hOut
              ? { x: this.closingOrigin.hOut.x, y: this.closingOrigin.hOut.y }
              : null
            if (dist < thresh) {
              target.hIn = this.closingOrigin.hIn
                ? { x: this.closingOrigin.hIn.x, y: this.closingOrigin.hIn.y }
                : null
            } else {
              target.hIn = cursor
            }
          } else {
            target.hIn = this.closingOrigin.hIn
              ? { x: this.closingOrigin.hIn.x, y: this.closingOrigin.hIn.y }
              : null
            if (dist < thresh) {
              target.hOut = this.closingOrigin.hOut
                ? { x: this.closingOrigin.hOut.x, y: this.closingOrigin.hOut.y }
                : null
            } else {
              target.hOut = cursor
            }
          }
        }
      }
      ctx.requestRender()
      return
    }
    // Proximity highlight for closing target before click
    {
      const scale = ctx.renderer.scale
      const closeDist = 8 / (scale > 0 ? scale : 1)
      const first = this.path.points[0]!
      const last = this.path.points[this.path.points.length - 1]!
      let hover: { index: number; kind: 'hIn' | 'hOut' } | null = null
      if (this.path.points.length >= 2) {
        const dFirst = Math.hypot(ctx.point.x - first.x, ctx.point.y - first.y)
        if (dFirst <= closeDist) hover = { index: 0, kind: 'hIn' }
        else {
          const dLast = Math.hypot(ctx.point.x - last.x, ctx.point.y - last.y)
          if (dLast <= closeDist)
            hover = { index: this.path.points.length - 1, kind: 'hOut' }
        }
        if (hover) {
          if (hover.index === this.activeIndex) hover = null
          else if (this.resumeEnd === 'start' && hover.index === 0) hover = null
          else if (
            this.resumeEnd === 'end' &&
            hover.index === this.path.points.length - 1
          )
            hover = null
        }
      }
      const prev = this.path.closingHover
      if (
        (prev?.index ?? -1) !== (hover?.index ?? -1) ||
        (prev?.kind ?? '') !== (hover?.kind ?? '')
      ) {
        this.path.closingHover = hover
        if (hover) ctx.setCursor('copy')
        else ctx.setCursor(this.cursor)
      } else {
        this.path.closingHover = hover
        if (hover) ctx.setCursor('copy')
      }
    }
    // Highlight any other open-ended path for connection
    const otherHit = this.findOpenEndpointNear(
      ctx.point,
      ctx.renderer.scale,
      ctx.scene
    )
    if (otherHit && otherHit.path !== this.path) {
      ;(
        ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
      ).setPenHover({ pathId: otherHit.path.id, index: otherHit.index })
      if (this.path.closingHover) this.path.closingHover = null
      ctx.setCursor('copy')
    } else {
      // No other path nearby — clear connection hover, keep closingHover as is
      const hasClosingHover = this.path.closingHover !== null
      if (!hasClosingHover) {
        ;(
          ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
        ).setPenHover(null)
      } else {
        ;(
          ctx.renderer as unknown as { setPenHover: (h: unknown) => void }
        ).setPenHover(null)
      }
    }
    this.path.cursor = ctx.point
    if (this.dragging && this.dragStart && this.activeIndex >= 0) {
      const cursorPt = { x: ctx.point.x, y: ctx.point.y }
      const mirrorPt = {
        x: this.dragStart.x * 2 - ctx.point.x,
        y: this.dragStart.y * 2 - ctx.point.y,
      }
      if (ctx.ctrlKey) {
        // Ctrl: in-curve and out-straight, like closing (opposite side)
        this.path.setHandles(this.activeIndex, null, mirrorPt)
      } else if (ctx.altKey) {
        // Alt: straighten In (hIn null, hOut at cursor)
        this.path.setHandles(this.activeIndex, cursorPt, null)
      } else {
        // Neither: default symmetrical, mirrored (opposite side from drag)
        const isStart = this.resumeEnd === 'start'
        if (isStart) {
          this.path.setHandles(this.activeIndex, mirrorPt, cursorPt)
        } else {
          this.path.setHandles(this.activeIndex, cursorPt, mirrorPt)
        }
      }
    }
    ctx.requestRender()
  }

  onPointerUp(ctx: ToolContext): void {
    if (this.closing) {
      // Keep curve on orange handle side: flip built handle to its mirror
      // so final committed curve remains where orange construction was.
      if (
        this.closingTargetIndex !== null &&
        this.closingHandleKind &&
        this.path
      ) {
        const target = this.path.points[this.closingTargetIndex]!
        if (this.closingHandleKind === 'hIn' && target.hIn) {
          target.hIn = {
            x: 2 * target.x - target.hIn.x,
            y: 2 * target.y - target.hIn.y,
          }
        } else if (this.closingHandleKind === 'hOut' && target.hOut) {
          target.hOut = {
            x: 2 * target.x - target.hOut.x,
            y: 2 * target.y - target.hOut.y,
          }
        }
      }
      this.path!.closed = true
      this.path!.closingTarget = null
      this.path!.closingCursor = null
      this.closing = false
      this.closingOrigin = null
      this.closingTargetIndex = null
      this.closingHandleKind = null
      this.dragging = false
      this.dragStart = null
      this.finish(ctx)
      return
    }
    // A plain click (no drag) leaves the anchor as a corner; a drag already
    // set its handles during the move. The path stays in draft mode either way.
    this.dragging = false
    this.dragStart = null
  }

  onKeyDown(ctx: ToolContext, key: string): void {
    if (key === 'Enter') this.finish(ctx)
    else if (key === 'Escape') this.cancel(ctx)
  }

  private finish(ctx: ToolContext): void {
    const path = this.path
    const wasResumed = !!this.resumeSnapshot
    this.reset()
    if (!path) return
    if (path.points.length < 2) {
      if (wasResumed) {
        // Resumed path had original points ΓÇö keep it, just finish
      } else {
        ctx.scene.remove(path)
        ctx.requestRender()
        return
      }
    }
    path.drafting = false
    path.cursor = null
    ctx.scene.select(path, false)
    logApiCall('scene.add', `path (${path.points.length} pts)`)
    ctx.requestRender()
  }

  private cancel(ctx: ToolContext): void {
    const path = this.path
    const snapshot = this.resumeSnapshot
    this.reset()
    if (!path) {
      ctx.requestRender()
      return
    }
    if (snapshot) {
      // Restore resumed path to original state, keep it in scene
      path.points = snapshot.points
      path.closed = snapshot.closed
      path.drafting = false
      path.cursor = null
      ctx.scene.select(path, false)
      ctx.requestRender()
      return
    }
    ctx.scene.remove(path)
    ctx.requestRender()
  }

  private reset(): void {
    if (this.path) {
      this.path.resumeEnd = null
      this.path.closingTarget = null
      this.path.closingCursor = null
      this.path.closingHover = null
    }
    this.path = null
    this.activeIndex = -1
    this.dragging = false
    this.dragStart = null
    this.closing = false
    this.closingOrigin = null
    this.closingTargetIndex = null
    this.closingHandleKind = null
    this.resumeSnapshot = null
    this.hoveredEndpoint = null
    this.resumeEnd = null
  }
}
