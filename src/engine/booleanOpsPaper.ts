import paper from 'paper'
import { PathElement } from '../elements/PathElement'
import { ShapeElement } from '../elements/ShapeElement'
import { shapeToPath } from './shapeToPath'
import type { BaseElement } from './BaseElement'

// Setup a PaperScope for geometry-only operations (no canvas needed)
const scope = new paper.PaperScope()
// @ts-ignore - setup with dummy size for headless boolean
try {
  // Paper needs a project, create one without view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(scope as any).setup(new scope.Size(100, 100))
} catch {
  // ignore if already setup or fails in test env
}

function toPaperPath(el: BaseElement): InstanceType<typeof paper.Path> | null {
  let path: PathElement | null = null
  if (el instanceof ShapeElement) {
    if (el.kind === 'line') return null
    path = shapeToPath(el)
  } else if (el instanceof PathElement) {
    if (!el.closed || el.points.length < 3) return null
    path = el
  } else {
    return null
  }

  const paperPath = new scope.Path() as InstanceType<typeof paper.Path>
  paperPath.closed = true

  for (const pt of path.points) {
    const wPt = path.storedToWorld({ x: pt.x, y: pt.y })
    const segPoint = new scope.Point(wPt.x, wPt.y)
    // Paper handleIn/handleOut are relative to point
    let handleIn: InstanceType<typeof paper.Point> | undefined
    let handleOut: InstanceType<typeof paper.Point> | undefined
    if (pt.hIn) {
      const hInW = path.storedToWorld(pt.hIn)
      handleIn = new scope.Point(hInW.x - wPt.x, hInW.y - wPt.y)
    }
    if (pt.hOut) {
      const hOutW = path.storedToWorld(pt.hOut)
      handleOut = new scope.Point(hOutW.x - wPt.x, hOutW.y - wPt.y)
    }
    const seg = new scope.Segment(segPoint, handleIn, handleOut)
    paperPath.add(seg)
  }
  paperPath.closed = path.closed
  return paperPath
}

function paperPathToPathElement(
  paperPath: InstanceType<typeof paper.Path>,
  source: BaseElement
): PathElement | null {
  const segs = paperPath.segments
  if (!segs || segs.length < 3) return null

  const points = segs.map(
    (seg: {
      point: { x: number; y: number }
      handleIn: { x: number; y: number }
      handleOut: { x: number; y: number }
    }) => {
      const x = seg.point.x
      const y = seg.point.y
      const hi = seg.handleIn
      const ho = seg.handleOut
      const hIn =
        hi && (hi.x !== 0 || hi.y !== 0) ? { x: x + hi.x, y: y + hi.y } : null
      const hOut =
        ho && (ho.x !== 0 || ho.y !== 0) ? { x: x + ho.x, y: y + ho.y } : null
      return { x, y, hIn, hOut }
    }
  )

  if (points.length < 3) return null

  const first = points[0]!
  const path = new PathElement(first.x, first.y, { ...source.style })
  path.rotation = 0
  path.artboardId = source.artboardId
  path.closed = true
  path.points = points
  path.name = `${source.name} Boolean`
  // Simplify: remove tiny segments and colinear points with no handles
  // Paper already does this, but we can optionally reduce near-duplicate points
  return path
}

function extractPaths(
  result:
    InstanceType<typeof paper.Path> | InstanceType<typeof paper.CompoundPath>,
  source: BaseElement
): PathElement[] {
  const out: PathElement[] = []
  // @ts-ignore - paper types
  if (result instanceof scope.CompoundPath) {
    for (const child of result.children as InstanceType<typeof paper.Path>[]) {
      const p = paperPathToPathElement(child, source)
      if (p) out.push(p)
    }
  } else {
    const p = paperPathToPathElement(
      result as InstanceType<typeof paper.Path>,
      source
    )
    if (p) out.push(p)
  }
  // Cleanup paper objects
  try {
    result.remove()
  } catch {}
  return out
}

export type BooleanOp = 'union' | 'intersection' | 'difference'

export function booleanOpPaper(
  a: BaseElement,
  b: BaseElement,
  op: BooleanOp
): PathElement[] | null {
  const pa = toPaperPath(a)
  const pb = toPaperPath(b)
  if (!pa || !pb) {
    pa?.remove()
    pb?.remove()
    return null
  }

  let result:
    | InstanceType<typeof paper.Path>
    | InstanceType<typeof paper.CompoundPath>
    | null = null
  try {
    if (op === 'union')
      result = pa.unite(pb) as unknown as InstanceType<typeof paper.Path>
    else if (op === 'intersection')
      result = pa.intersect(pb) as unknown as InstanceType<typeof paper.Path>
    else result = pa.subtract(pb) as unknown as InstanceType<typeof paper.Path>
  } catch {
    pa.remove()
    pb.remove()
    return null
  }

  // Cleanup originals
  pa.remove()
  pb.remove()

  if (!result) return []
  // Check if result is empty (e.g., difference where B fully covers A)
  // @ts-ignore
  if (result.isEmpty && result.isEmpty()) {
    result.remove()
    return []
  }
  // @ts-ignore - area check
  const area = typeof result.getArea === 'function' ? result.getArea() : 1
  if (Math.abs(area) < 0.5) {
    result.remove()
    return []
  }

  const out = extractPaths(result, a)
  return out
}
