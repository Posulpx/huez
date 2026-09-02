import type { BaseElement } from './BaseElement'
import type { Scene } from './Scene'
import { ArtboardElement } from '../elements/ArtboardElement'
import { TextElement } from '../elements/TextElement'
import { PathElement } from '../elements/PathElement'
import { handlePoints, HANDLE_HIT_RADIUS } from './TransformHandles'

/**
 * Renders a Scene to a Canvas 2D context with proper device-pixel-ratio
 * scaling. Knows nothing about tools or UI — it only paints elements.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D
  private dpr = 1

  /** Viewport: world -> screen is `screen = world * scale + offset` (CSS px). */
  scale = 1
  offsetX = 0
  offsetY = 0

  /** Rubber-band (marquee) selection rectangle in world space, or null. */
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null =
    null

  /** Pen node awareness — when pen is active, highlight open endpoints. */
  private penActive = false
  private penHover: { pathId: string; index: number } | null = null

  /** Group rotation preview — original bounds + angle + elements for complete preview, drawn until release. */
  private groupPreview: {
    rect: { x: number; y: number; w: number; h: number }
    angle: number
    elements?: {
      el: import('./BaseElement').BaseElement
      startRect: import('./TransformHandles').Rect
      startRotation: number
    }[]
  } | null = null

  private static readonly MIN_SCALE = 0.1
  private static readonly MAX_SCALE = 8

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.resize()
  }

  /** Match the backing store to the CSS size * devicePixelRatio. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr))
  }

  get width(): number {
    return this.canvas.width / this.dpr
  }

  get height(): number {
    return this.canvas.height / this.dpr
  }

  /** Reset pan/zoom to the default identity view. */
  resetView(): void {
    this.scale = 1
    this.offsetX = 0
    this.offsetY = 0
  }

  /** Pan by a delta in screen (CSS) pixels. */
  pan(dxScreen: number, dyScreen: number): void {
    this.offsetX += dxScreen
    this.offsetY += dyScreen
  }

  /** Pan by a delta expressed in world units (used by world-space tools). */
  panWorld(dxWorld: number, dyWorld: number): void {
    this.offsetX += dxWorld * this.scale
    this.offsetY += dyWorld * this.scale
  }

  /** Zoom by `factor`, keeping the world point under (clientX, clientY) fixed. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.canvas.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    const next = clamp(
      this.scale * factor,
      CanvasRenderer.MIN_SCALE,
      CanvasRenderer.MAX_SCALE
    )
    if (next === this.scale) return
    // World point currently under the cursor.
    const wx = (sx - this.offsetX) / this.scale
    const wy = (sy - this.offsetY) / this.scale
    // Re-anchor so that world point stays under the cursor.
    this.offsetX = sx - wx * next
    this.offsetY = sy - wy * next
    this.scale = next
  }

  render(scene: Scene): void {
    const { ctx, dpr } = this
    // Clear the full backing store (identity transform) before applying view.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    // Opaque base so the grid is drawn on a clean field (no stage pattern).
    ctx.fillStyle = '#0f1115'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(
      dpr * this.scale,
      0,
      0,
      dpr * this.scale,
      dpr * this.offsetX,
      dpr * this.offsetY
    )

    // 0) Faint grid texture, behind everything, in world space (pans/zooms).
    this.drawGrid()

    // 1) Each artboard renders as a single z-unit with its children, in
    //    scene (layer) order. Grouping the children with their board means
    //    reordering an artboard in the layers panel moves its whole stack
    //    (background + contents) as one, and an upper artboard fully covers a
    //    lower one including the lower one's children.
    const childrenOf = new Map<string, BaseElement[]>()
    for (const el of scene.all) {
      if (el instanceof ArtboardElement) continue
      if (
        el.artboardId &&
        scene.getElementById(el.artboardId) instanceof ArtboardElement
      ) {
        if (!childrenOf.has(el.artboardId)) childrenOf.set(el.artboardId, [])
        childrenOf.get(el.artboardId)!.push(el)
      }
    }

    // Hide original group elements during rotation preview to avoid origin trace
    const previewIds = new Set(
      this.groupPreview?.elements?.map((e) => e.el.id) ?? []
    )
    const isPreviewing = !!this.groupPreview

    for (const ab of scene.artboards) {
      if (!ab.visible) continue
      ab.draw(ctx)
      const kids = childrenOf.get(ab.id)
      if (kids && kids.length) {
        ctx.save()
        ctx.beginPath()
        const ax = Math.min(ab.x, ab.x + ab.width)
        const ay = Math.min(ab.y, ab.y + ab.height)
        ctx.rect(ax, ay, Math.abs(ab.width), Math.abs(ab.height))
        ctx.clip()
        for (const child of kids) {
          if (child.visible) {
            if (isPreviewing && previewIds.has(child.id)) continue
            child.draw(ctx)
          }
        }
        ctx.restore()
      }
    }

    // 2) Free elements (not assigned to any artboard) always render on top of
    //    every artboard unit, in scene order. Stale/orphan assignments also go
    //    here so they stay visible.
    for (const el of scene.all) {
      if (el instanceof ArtboardElement) continue
      if (
        el.artboardId &&
        scene.getElementById(el.artboardId) instanceof ArtboardElement
      )
        continue
      if (el.visible) {
        if (isPreviewing && previewIds.has(el.id)) continue
        el.draw(ctx)
      }
    }

    // Active artboard highlight — subtle outline for the last interacted artboard
    this.drawActiveArtboardHighlight(scene)

    // Selection overlays are never clipped — bounds/handles stay visible.
    this.drawSelectionOverlay(scene)

    // Pen node awareness — show open endpoints where pen can continue.
    if (this.penActive) this.drawPenNodeAwareness(scene)

    // Group rotation preview — original bounds rotated, until release
    if (this.groupPreview) this.drawGroupPreview()

    // Rubber-band (marquee) selection rectangle, drawn above everything.
    if (this.marquee) this.drawMarquee()
  }

  /** Sets the rubber-band selection rectangle (world space) or null to clear. */
  setMarquee(
    rect: { x0: number; y0: number; x1: number; y1: number } | null
  ): void {
    this.marquee = rect
  }

  setPenActive(active: boolean): void {
    this.penActive = active
  }

  setPenHover(hover: { pathId: string; index: number } | null): void {
    this.penHover = hover
  }

  setGroupPreview(
    rect: { x: number; y: number; w: number; h: number } | null,
    angle: number,
    elements?: {
      el: import('./BaseElement').BaseElement
      startRect: import('./TransformHandles').Rect
      startRotation: number
    }[]
  ): void {
    this.groupPreview = rect ? { rect, angle, elements } : null
  }

  private drawMarquee(): void {
    const { ctx } = this
    const m = this.marquee!
    const x = Math.min(m.x0, m.x1)
    const y = Math.min(m.y0, m.y1)
    const w = Math.abs(m.x1 - m.x0)
    const h = Math.abs(m.y1 - m.y0)
    ctx.save()
    ctx.fillStyle = 'rgba(79, 140, 255, 0.12)'
    ctx.fillRect(x, y, w, h)
    ctx.lineWidth = 1 / this.scale
    ctx.strokeStyle = '#4f8cff'
    ctx.setLineDash([4 / this.scale, 4 / this.scale])
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  }

  private drawActiveArtboardHighlight(scene: Scene): void {
    const activeId = scene.activeArtboardId
    if (!activeId) return
    const ab = scene.getElementById(activeId)
    if (!(ab instanceof ArtboardElement) || !ab.visible) return
    const { ctx } = this
    ctx.save()
    const b = ab.bounds
    const x0 = Math.min(b.x, b.x + b.width)
    const y0 = Math.min(b.y, b.y + b.height)
    const w = Math.abs(b.width)
    const h = Math.abs(b.height)
    ctx.lineWidth = 1.5 / this.scale
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.45)'
    ctx.strokeRect(
      x0 - 0.5 / this.scale,
      y0 - 0.5 / this.scale,
      w + 1 / this.scale,
      h + 1 / this.scale
    )
    ctx.restore()
  }

  private drawPenNodeAwareness(scene: Scene): void {
    const { ctx } = this
    ctx.save()
    for (const el of scene.all) {
      if (!(el instanceof PathElement)) continue
      if (el.closed || el.drafting) continue
      if (el.points.length === 0) continue
      // Only endpoints are continuation targets
      const endpoints = [0, el.points.length - 1]
      // Avoid double-drawing single-point path
      const uniq = endpoints[0] === endpoints[1] ? [0] : endpoints
      for (const idx of uniq) {
        const pt = el.points[idx]!
        const vis = el.storedToWorld({ x: pt.x, y: pt.y })
        const isHovered =
          this.penHover?.pathId === el.id && this.penHover?.index === idx
        const isStart = idx === 0
        if (isHovered) {
          ctx.fillStyle = '#ff8c00'
          ctx.strokeStyle = '#ffffff'
          const sz = 7 / this.scale
          ctx.lineWidth = 1.5 / this.scale
          ctx.fillRect(vis.x - sz, vis.y - sz, sz * 2, sz * 2)
          ctx.strokeRect(vis.x - sz, vis.y - sz, sz * 2, sz * 2)
          ctx.strokeStyle = '#ff8c00'
          ctx.lineWidth = 1 / this.scale
          ctx.strokeRect(
            vis.x - sz - 2 / this.scale,
            vis.y - sz - 2 / this.scale,
            (sz + 2 / this.scale) * 2,
            (sz + 2 / this.scale) * 2
          )
        } else {
          const sz = 5 / this.scale
          ctx.fillStyle = isStart ? 'rgba(79,140,255,0.18)' : '#ffffff'
          ctx.strokeStyle = '#4f8cff'
          ctx.lineWidth = 1.5 / this.scale
          ctx.fillRect(vis.x - sz, vis.y - sz, sz * 2, sz * 2)
          ctx.strokeRect(vis.x - sz, vis.y - sz, sz * 2, sz * 2)
          if (isStart) {
            ctx.fillStyle = '#4f8cff'
            ctx.beginPath()
            ctx.arc(vis.x, vis.y, 1.6 / this.scale, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }
    ctx.restore()
  }

  private drawGroupPreview(): void {
    const gp = this.groupPreview
    if (!gp) return
    const { ctx } = this
    ctx.save()
    const { rect, angle, elements } = gp
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2

    // Draw original bounds as solid faint reference (retained until new selection)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.translate(-cx, -cy)
    ctx.lineWidth = 1 / this.scale
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.25)'
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    ctx.restore()

    // Draw complete preview of each element rotated around group center
    // Do not leave origin trace: original elements are hidden during preview
    // (handled via Scene's group preview flag), only preview is visible
    if (elements && elements.length > 0) {
      for (const { el, startRect: r, startRotation } of elements) {
        const elCx = r.x + r.w / 2
        const elCy = r.y + r.h / 2
        const dx = elCx - cx
        const dy = elCy - cy
        const c = Math.cos(angle)
        const s = Math.sin(angle)
        const rx = dx * c - dy * s
        const ry = dx * s + dy * c
        const newCx = cx + rx
        const newCy = cy + ry
        const newRotation = startRotation + angle

        ctx.save()
        ctx.globalAlpha = 0.85
        const previewEl = el.clone()
        const pb = previewEl.bounds
        previewEl.moveTo(newCx - pb.width / 2, newCy - pb.height / 2)
        previewEl.rotation = newRotation
        previewEl.draw(ctx)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  /** Draws a faint coordinate grid across the visible world area. The grid
   *  lives in world space so it pans and zooms with the canvas, and its step
   *  adapts to keep an even on-screen density. */
  private drawGrid(): void {
    const { ctx, dpr } = this
    const cssW = this.canvas.width / dpr
    const cssH = this.canvas.height / dpr
    const left = -this.offsetX / this.scale
    const top = -this.offsetY / this.scale
    const right = (cssW - this.offsetX) / this.scale
    const bottom = (cssH - this.offsetY) / this.scale

    // Pick a world step whose on-screen size stays in a comfortable range.
    let step = 24
    while (step * this.scale < 12) step *= 2
    while (step * this.scale > 64) step /= 2

    const major = step * 5
    ctx.lineWidth = 1 / this.scale // ≈ 1 CSS px

    // Minor lines.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)'
    ctx.beginPath()
    for (let x = Math.floor(left / step) * step; x <= right; x += step) {
      if (Math.abs(x % major) < 1e-6) continue
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
    }
    for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
      if (Math.abs(y % major) < 1e-6) continue
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
    }
    ctx.stroke()

    // Major lines (every 5th), slightly stronger.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.beginPath()
    for (let x = Math.floor(left / major) * major; x <= right; x += major) {
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
    }
    for (let y = Math.floor(top / major) * major; y <= bottom; y += major) {
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
    }
    ctx.stroke()
  }

  private drawSelectionOverlay(scene: Scene): void {
    const { ctx } = this
    ctx.save()
    // Group transform: for 2+ selection, draw a single group bounding box
    if (scene.selected.length > 1) {
      const sel = scene.selected.filter((el) => el.visible)
      // Skip if any is Path editing (handled per-element)
      const hasEditingPath = sel.some(
        (el) => el instanceof PathElement && (el as PathElement).editing
      )
      if (!hasEditingPath && sel.length > 1) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        for (const el of sel) {
          const b = el.bounds
          const x0 = Math.min(b.x, b.x + b.width)
          const x1 = Math.max(b.x, b.x + b.width)
          const y0 = Math.min(b.y, b.y + b.height)
          const y1 = Math.max(b.y, b.y + b.height)
          if (x0 < minX) minX = x0
          if (y0 < minY) minY = y0
          if (x1 > maxX) maxX = x1
          if (y1 > maxY) maxY = y1
        }
        if (isFinite(minX)) {
          const w = maxX - minX
          const h = maxY - minY
          ctx.lineWidth = 1
          ctx.strokeStyle = '#4f8cff'
          ctx.setLineDash([4, 4])
          ctx.strokeRect(minX, minY, w, h)
          ctx.setLineDash([])
          // Group handles (8 scale + rotate)
          const cx = minX + w / 2
          const cy = minY + h / 2
          const handlePos = [
            { x: minX, y: minY },
            { x: cx, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: cy },
            { x: maxX, y: maxY },
            { x: cx, y: maxY },
            { x: minX, y: maxY },
            { x: minX, y: cy },
          ]
          for (const p of handlePos) {
            ctx.fillStyle = '#ffffff'
            ctx.strokeStyle = '#4f8cff'
            ctx.lineWidth = 1.5
            ctx.fillRect(p.x - 4, p.y - 4, 8, 8)
            ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
          }
          // Rotate handle
          const rh = { x: cx, y: minY - 28 }
          ctx.beginPath()
          ctx.moveTo(cx, minY)
          ctx.lineTo(rh.x, rh.y)
          ctx.strokeStyle = '#4f8cff'
          ctx.stroke()
          ctx.beginPath()
          ctx.fillStyle = '#4f8cff'
          ctx.arc(rh.x, rh.y, 6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        return
      }
    }
    for (const el of scene.selected) {
      if (!el.visible) continue
      // In edit mode the text's bounding box is hidden and the caret must not
      // affect it — the DOM textarea is the caret host.
      if (el instanceof TextElement && el.editing) continue
      // Path in vertex-edit mode draws its own overlay (anchors/handles) instead
      // of the normal transform box.
      if (el instanceof PathElement && el.editing) {
        this.drawPathEditOverlay(el)
        continue
      }
      const b = el.bounds

      // Selected artboards get an orange label highlight so the move handle is
      // unmistakable. Replicates the element's own transform to line up.
      if (el instanceof ArtboardElement) {
        const cx = b.x + b.width / 2
        const cy = b.y + b.height / 2
        ctx.save()
        ctx.translate(cx, cy)
        if (el.rotation) ctx.rotate(el.rotation)
        ctx.translate(-cx, -cy)
        ctx.translate(b.x, b.y)
        const w = el.width
        const x0 = Math.min(0, w) - 2
        const x1 = Math.max(0, w) + 2
        const labelH = 18
        ctx.fillStyle = 'rgba(255, 140, 0, 0.18)'
        ctx.fillRect(x0, -labelH, x1 - x0, labelH)
        ctx.fillStyle = '#ff8c00'
        ctx.font = '12px system-ui, sans-serif'
        ctx.textBaseline = 'bottom'
        ctx.fillText(el.name, 2, -4)
        ctx.restore()
      }

      // Rotated bounding outline.
      const corners = [
        this.worldCorner(el, 0, 0),
        this.worldCorner(el, b.width, 0),
        this.worldCorner(el, b.width, b.height),
        this.worldCorner(el, 0, b.height),
      ]
      ctx.lineWidth = 1
      ctx.strokeStyle = '#4f8cff'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(corners[0]!.x, corners[0]!.y)
      for (let i = 1; i < corners.length; i++)
        ctx.lineTo(corners[i]!.x, corners[i]!.y)
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])

      // Handles (skip the rotate handle for multi-selection and for artboards).
      const handles = handlePoints(el)
      const isArtboard = el instanceof ArtboardElement
      const isSingle = scene.selected.length === 1
      const top = this.worldCorner(el, b.width / 2, 0)
      const rotate = handles.find((h) => h.id === 'rotate')

      if (isSingle && rotate && !isArtboard) {
        ctx.beginPath()
        ctx.moveTo(top.x, top.y)
        ctx.lineTo(rotate.x, rotate.y)
        ctx.strokeStyle = '#4f8cff'
        ctx.stroke()
        ctx.beginPath()
        ctx.fillStyle = '#4f8cff'
        ctx.arc(rotate.x, rotate.y, HANDLE_HIT_RADIUS - 2, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const h of handles) {
        if (h.id === 'rotate') continue
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#4f8cff'
        ctx.lineWidth = 1.5
        ctx.fillRect(h.x - 4, h.y - 4, 8, 8)
        ctx.strokeRect(h.x - 4, h.y - 4, 8, 8)
      }
    }
    ctx.restore()
  }

  private drawPathEditOverlay(el: PathElement): void {
    const { ctx } = this
    // Draw anchors, handle arms, and handle circles in visual (rotated) space
    ctx.save()
    ctx.lineWidth = 1 / this.scale
    // Also draw a faint outline of the path bounds for context (optional)
    // Anchor / handle visuals
    for (let i = 0; i < el.points.length; i++) {
      const a = el.points[i]!
      const va = el.storedToWorld({ x: a.x, y: a.y })
      const isSelected = el.editingSelected === i
      // Handle arms
      if (a.hOut) {
        const vh = el.storedToWorld(a.hOut)
        ctx.strokeStyle = isSelected ? '#ff8c00' : '#4f8cff'
        ctx.beginPath()
        ctx.moveTo(va.x, va.y)
        ctx.lineTo(vh.x, vh.y)
        ctx.stroke()
        ctx.fillStyle = isSelected ? '#ff8c00' : '#4f8cff'
        ctx.beginPath()
        ctx.arc(vh.x, vh.y, 4 / this.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1 / this.scale
        ctx.stroke()
      }
      if (a.hIn) {
        const vh = el.storedToWorld(a.hIn)
        ctx.strokeStyle = isSelected ? '#ff8c00' : '#4f8cff'
        ctx.beginPath()
        ctx.moveTo(va.x, va.y)
        ctx.lineTo(vh.x, vh.y)
        ctx.stroke()
        ctx.fillStyle = isSelected ? '#ff8c00' : '#4f8cff'
        ctx.beginPath()
        ctx.arc(vh.x, vh.y, 4 / this.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1 / this.scale
        ctx.stroke()
      }
      // Anchor square
      const sz = 6 / this.scale
      // Outer highlight for selected
      if (isSelected) {
        ctx.fillStyle = 'rgba(255,140,0,0.18)'
        ctx.fillRect(va.x - sz - 2, va.y - sz - 2, sz * 2 + 4, sz * 2 + 4)
      }
      ctx.fillStyle = isSelected ? '#ff8c00' : '#ffffff'
      ctx.strokeStyle = isSelected ? '#ff8c00' : '#4f8cff'
      ctx.lineWidth = 1.5 / this.scale
      ctx.fillRect(va.x - sz, va.y - sz, sz * 2, sz * 2)
      ctx.strokeRect(va.x - sz, va.y - sz, sz * 2, sz * 2)
    }
    // Hint text (world space, inverse-scaled font)
    const b = el.bounds
    const tip = el.storedToWorld({ x: b.x, y: b.y - 12 / this.scale })
    ctx.fillStyle = 'rgba(79,140,255,0.95)'
    ctx.font = `${12 / this.scale}px system-ui, sans-serif`
    ctx.textBaseline = 'bottom'
    const msg =
      'Editing — drag points/handles • click stroke to add • dbl-click point to delete • Enter/Esc to finish'
    ctx.fillText(msg, tip.x, tip.y)
    ctx.restore()
  }

  private worldCorner(
    el: BaseElement,
    lx: number,
    ly: number
  ): { x: number; y: number } {
    const b = el.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    let dx = lx - b.width / 2
    let dy = ly - b.height / 2
    if (el.rotation) {
      const c = Math.cos(el.rotation)
      const s = Math.sin(el.rotation)
      const rx = dx * c - dy * s
      const ry = dx * s + dy * c
      dx = rx
      dy = ry
    }
    return { x: dx + cx, y: dy + cy }
  }

  /** Convert a DOM event point to world coordinates (inverse of the view). */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    }
  }

  /** Convert a DOM event point to screen (CSS) coordinates relative to the canvas. */
  toScreen(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  /** Expose the context for tools that need direct drawing (rare). */
  get context(): CanvasRenderingContext2D {
    return this.ctx
  }

  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export type { BaseElement }
