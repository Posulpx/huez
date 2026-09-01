import type { Tool, ToolContext } from '../Tool'
import { PathElement } from '../../elements/PathElement'
import type { Point } from '../../engine/types'

/**
 * PencilTool — freehand sketching with smoothing.
 * Draws a polyline of points, smoothed via Chaikin or Douglas-Peucker,
 * then converts to a PathElement with bezier handles.
 */
export class PencilTool implements Tool {
  readonly id = 'pencil'
  readonly label = 'Pencil'
  readonly icon = '✏️'
  readonly cursor = 'crosshair'
  readonly category: Tool['category'] = 'geometry'

  private path: PathElement | null = null
  private points: Point[] = []

  onPointerDown(ctx: ToolContext): void {
    ctx.history?.push()
    const ab = ctx.scene.artboardAtPoint(ctx.point)
    this.path = new PathElement(ctx.point.x, ctx.point.y)
    this.path.drafting = true
    if (ab) this.path.artboardId = ab.id
    this.points = [ctx.point]
    this.path.addAnchor(ctx.point)
    ctx.scene.add(this.path)
    ctx.scene.select(this.path)
    ctx.requestRender()
  }

  onPointerMove(ctx: ToolContext): void {
    if (!this.path) return
    const last = this.points[this.points.length - 1]!
    if (Math.hypot(ctx.point.x - last.x, ctx.point.y - last.y) < 3) return
    this.points.push({ x: ctx.point.x, y: ctx.point.y })
    // Smooth: add anchor, keep last handle for preview
    this.path.addAnchor(ctx.point)
    this.path.cursor = ctx.point
    ctx.requestRender()
  }

  onPointerUp(ctx: ToolContext): void {
    if (!this.path) return
    if (this.points.length < 3) {
      ctx.scene.remove(this.path)
    } else {
      // Simple smoothing: Douglas-Peucker with tolerance 2
      const simplified = this.simplify(this.points, 2)
      this.path.points = simplified.map((p) => ({
        x: p.x,
        y: p.y,
        hIn: null,
        hOut: null,
      }))
      this.path.closed = false
      // Smooth handles for middle points
      for (let i = 1; i < this.path.points.length - 1; i++) {
        const prev = this.path.points[i - 1]!
        const cur = this.path.points[i]!
        const next = this.path.points[i + 1]!
        const vx = next.x - prev.x
        const vy = next.y - prev.y
        const len = Math.hypot(vx, vy) || 1
        const nx = vx / len
        const ny = vy / len
        const dist =
          0.3 *
          Math.min(
            Math.hypot(cur.x - prev.x, cur.y - prev.y),
            Math.hypot(next.x - cur.x, next.y - cur.y)
          )
        cur.hIn = { x: cur.x - nx * dist, y: cur.y - ny * dist }
        cur.hOut = { x: cur.x + nx * dist, y: cur.y + ny * dist }
      }
    }
    this.path.drafting = false
    this.path.cursor = null
    ctx.requestRender()
    this.path = null
    this.points = []
  }

  private simplify(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points
    // Douglas-Peucker
    const sqTol = tolerance * tolerance
    const markers = new Array(points.length).fill(0)
    markers[0] = 1
    markers[markers.length - 1] = 1
    const stack: [number, number][] = [[0, points.length - 1]]
    while (stack.length) {
      const [first, last] = stack.pop()!
      let maxSqDist = 0
      let index = -1
      for (let i = first + 1; i < last; i++) {
        const sqDist = this.sqSegDist(points[i]!, points[first]!, points[last]!)
        if (sqDist > maxSqDist) {
          index = i
          maxSqDist = sqDist
        }
      }
      if (maxSqDist > sqTol) {
        markers[index] = 1
        stack.push([first, index], [index, last])
      }
    }
    return points.filter((_, i) => markers[i])
  }

  private sqSegDist(p: Point, a: Point, b: Point): number {
    let x = a.x,
      y = a.y,
      dx = b.x - x,
      dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }
}
