import type {
  AnchorPoint,
  Bounds,
  ElementStyle,
  Point,
  ShadowStyle,
} from './types'
import { cloneStyle, defaultStyle } from './types'

let idCounter = 0

/**
 * Abstract base for every paintable item in the scene graph.
 * Subclasses implement `render` for shape-specific drawing and
 * `localBounds` for hit-testing in local space.
 */
export abstract class BaseElement {
  readonly id: string
  name: string

  x: number
  y: number
  rotation = 0 // radians, around the element origin (top-left of bounds)

  /** Layer state — drives the Layers panel. */
  visible = true
  locked = false

  /** Id of the Artboard this element is clipped to, or null if free. */
  artboardId: string | null = null

  /** Anchor point used to position this element relative to its artboard. */
  anchor: AnchorPoint = 'n'

  style: ElementStyle

  constructor(x: number, y: number, style?: Partial<ElementStyle>) {
    this.id = `el_${++idCounter}`
    this.name = this.constructor.name
    this.x = x
    this.y = y
    this.style = { ...defaultStyle(), ...style }
  }

  /** Axis-aligned bounds in world space (ignores rotation for simplicity). */
  abstract get bounds(): Bounds

  /** Draw the element's geometry in local space (origin at 0,0). */
  protected abstract render(ctx: CanvasRenderingContext2D): void

  /** Apply the element transform + style, then delegate to `render`. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    ctx.save()
    ctx.globalAlpha = clamp01(this.style.opacity)
    this.applyShadow(ctx, this.style.shadow)
    // Rotate about the element center, then place local origin at (x, y).
    ctx.translate(cx, cy)
    if (this.rotation) ctx.rotate(this.rotation)
    ctx.translate(-cx, -cy)
    ctx.translate(b.x, b.y)
    this.render(ctx)
    ctx.restore()
  }

  /** Bounds relative to the element origin (0,0). */
  protected abstract get localBounds(): Bounds

  private applyShadow(
    ctx: CanvasRenderingContext2D,
    shadow: ShadowStyle
  ): void {
    if (!shadow.enabled) return
    ctx.shadowColor = shadow.color
    ctx.shadowBlur = shadow.blur
    ctx.shadowOffsetX = shadow.offsetX
    ctx.shadowOffsetY = shadow.offsetY
  }

  /** Hit-test a world-space point against this element. `scale` is the current
   *  viewport zoom; subclasses (e.g. artboards) use it to keep handle hit
   *  areas a constant size on screen when zoomed out. */
  hitTest(p: Point, scale = 1): boolean {
    const b = this.bounds
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    // Move into the center frame, undo rotation, then into local space.
    let dx = p.x - cx
    let dy = p.y - cy
    if (this.rotation) {
      const c = Math.cos(-this.rotation)
      const s = Math.sin(-this.rotation)
      const rx = dx * c - dy * s
      const ry = dx * s + dy * c
      dx = rx
      dy = ry
    }
    const lx = dx + b.width / 2
    const ly = dy + b.height / 2
    return this.hitTestLocal({ x: lx, y: ly }, scale)
  }

  protected abstract hitTestLocal(p: Point, scale?: number): boolean

  /** Move the element so its top-left lands at the given world point. */
  moveTo(x: number, y: number): void {
    this.x = x
    this.y = y
  }

  clone(): BaseElement {
    const copy = this.cloneSelf()
    copy.style = cloneStyle(this.style)
    copy.rotation = this.rotation
    copy.visible = this.visible
    copy.locked = this.locked
    copy.artboardId = this.artboardId
    copy.anchor = this.anchor
    return copy
  }

  protected abstract cloneSelf(): BaseElement
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
