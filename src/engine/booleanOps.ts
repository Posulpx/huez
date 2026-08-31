import polygonClipping from 'polygon-clipping'
import { PathElement } from '../elements/PathElement'
import { ShapeElement } from '../elements/ShapeElement'
import { shapeToPath } from './shapeToPath'
import { booleanOpPaper } from './booleanOpsPaper'
import type { BaseElement } from './BaseElement'
import type { Point } from './types'

// polygon-clipping types: Polygon = Ring[], Ring = [x,y][], MultiPolygon = Polygon[]
type Ring = [number, number][]
type Polygon = Ring[]
type MultiPolygon = Polygon[]

/**
 * Convert a BaseElement (Shape or Path) to a polygon-clipping Polygon.
 * Returns null if the element cannot be used for boolean (e.g. open path, line).
 */
function toPolygon(el: BaseElement): Polygon | null {
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

  const ring = pathToRing(path)
  if (ring.length < 3) return null
  // Ensure closed ring (first == last) for polygon-clipping
  const closedRing: Ring = [...ring]
  const first = closedRing[0]!
  const last = closedRing[closedRing.length - 1]!
  if (first[0] !== last[0] || first[1] !== last[1]) {
    closedRing.push([first[0], first[1]])
  }
  return [closedRing]
}

function pathToRing(path: PathElement): Ring {
  const ring: Ring = []
  // Use world-space points (account for rotation)
  const pts = path.points
  if (pts.length === 0) return ring

  // Helper to convert stored point to world
  const toWorld = (p: Point): Point => path.storedToWorld(p)

  // Sample each Bezier segment with 24 steps for good boolean accuracy
  const steps = 24
  const firstWorld = toWorld({ x: pts[0]!.x, y: pts[0]!.y })
  ring.push([firstWorld.x, firstWorld.y])

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!
    const cur = pts[i]!
    const prevWorld = toWorld({ x: prev.x, y: prev.y })
    const curWorld = toWorld({ x: cur.x, y: cur.y })
    const prevHOut = prev.hOut ? toWorld(prev.hOut) : null
    const curHIn = cur.hIn ? toWorld(cur.hIn) : null
    const c1 = prevHOut ?? prevWorld
    const c2 = curHIn ?? curWorld

    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const mt = 1 - t
      const x =
        mt * mt * mt * prevWorld.x +
        3 * mt * mt * t * c1.x +
        3 * mt * t * t * c2.x +
        t * t * t * curWorld.x
      const y =
        mt * mt * mt * prevWorld.y +
        3 * mt * mt * t * c1.y +
        3 * mt * t * t * c2.y +
        t * t * t * curWorld.y
      ring.push([x, y])
    }
  }

  // Close segment last -> first
  if (path.closed && pts.length > 1) {
    const last = pts[pts.length - 1]!
    const first = pts[0]!
    const lastWorld = toWorld({ x: last.x, y: last.y })
    const firstWorld = toWorld({ x: first.x, y: first.y })
    const lastHOut = last.hOut ? toWorld(last.hOut) : null
    const firstHIn = first.hIn ? toWorld(first.hIn) : null
    const c1 = lastHOut ?? lastWorld
    const c2 = firstHIn ?? firstWorld
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const mt = 1 - t
      const x =
        mt * mt * mt * lastWorld.x +
        3 * mt * mt * t * c1.x +
        3 * mt * t * t * c2.x +
        t * t * t * firstWorld.x
      const y =
        mt * mt * mt * lastWorld.y +
        3 * mt * mt * t * c1.y +
        3 * mt * t * t * c2.y +
        t * t * t * firstWorld.y
      ring.push([x, y])
    }
  }

  return ring
}

function polygonToPath(
  polygon: Polygon,
  source: BaseElement
): PathElement | null {
  // Use outer ring (first ring), ignore holes for simple boolean
  const ring = polygon[0]
  if (!ring || ring.length < 3) return null

  // Remove duplicate closing point if present
  const pts = ring.slice()
  if (pts.length > 1) {
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    if (first[0] === last[0] && first[1] === last[1]) {
      pts.pop()
    }
  }
  if (pts.length < 3) return null

  // Create PathElement with points as corners (no handles), closed
  // Use first point as origin
  const firstPt = pts[0]!
  const path = new PathElement(firstPt[0], firstPt[1], {
    ...source.style,
  })
  path.rotation = 0
  path.artboardId = source.artboardId
  path.closed = true
  path.points = pts.map(([x, y]) => ({
    x,
    y,
    hIn: null,
    hOut: null,
  }))
  // Set x,y to first point for moveTo semantics
  path.moveTo(firstPt[0], firstPt[1])
  // Actually points are already at world positions, and path.x/y is firstPt, so moveTo with same will not shift
  // Ensure name
  path.name = `${source.name} Boolean`

  return path
}

function multiPolygonToPaths(
  result: MultiPolygon,
  source: BaseElement
): PathElement[] {
  const out: PathElement[] = []
  for (const poly of result) {
    const p = polygonToPath(poly, source)
    if (p) out.push(p)
  }
  return out
}

export type BooleanOp = 'union' | 'intersection' | 'difference'

export function booleanOp(
  a: BaseElement,
  b: BaseElement,
  op: BooleanOp
): PathElement[] | null {
  // Try paper.js first for bezier handle preservation (fewer nodes)
  try {
    const paperResult = booleanOpPaper(a, b, op)
    if (paperResult !== null) {
      // Paper succeeded (including empty []), use it if it has reasonable node count
      // Paper preserves original bezier segments, so much fewer nodes than 24*segments
      return paperResult
    }
  } catch {
    // fall through to polygon-clipping
  }

  const polyA = toPolygon(a)
  const polyB = toPolygon(b)
  if (!polyA || !polyB) return null

  let result: MultiPolygon
  try {
    if (op === 'union') {
      result = polygonClipping.union(polyA, polyB) as MultiPolygon
    } else if (op === 'intersection') {
      result = polygonClipping.intersection(polyA, polyB) as MultiPolygon
    } else {
      result = polygonClipping.difference(polyA, polyB) as MultiPolygon
    }
  } catch {
    return null
  }

  if (!result || result.length === 0) return []
  // Use style from first element (a) for result
  return multiPolygonToPaths(result, a)
}

// Convenience wrappers
export function union(a: BaseElement, b: BaseElement): PathElement[] | null {
  return booleanOp(a, b, 'union')
}
export function intersection(
  a: BaseElement,
  b: BaseElement
): PathElement[] | null {
  return booleanOp(a, b, 'intersection')
}
export function difference(
  a: BaseElement,
  b: BaseElement
): PathElement[] | null {
  return booleanOp(a, b, 'difference')
}
