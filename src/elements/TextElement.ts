import { BaseElement } from '../engine/BaseElement'
import type { Bounds, ElementStyle, Point } from '../engine/types'

export interface TextOptions {
  text?: string
  fontFamily?: string
  fontSize?: number
  fontStyle?: 'normal' | 'bold' | 'italic'
  align?: CanvasTextAlign
  color?: string
}

/**
 * A dynamic text element. Font metrics drive the local bounds so
 * selection, hit-testing, and fills/strokes wrap the glyphs precisely.
 */
export class TextElement extends BaseElement {
  text: string
  fontFamily: string
  fontSize: number
  fontStyle: 'normal' | 'bold' | 'italic'
  align: CanvasTextAlign
  color: string

  constructor(
    x: number,
    y: number,
    opts: TextOptions = {},
    style?: Partial<ElementStyle>
  ) {
    super(x, y, style)
    this.name = 'Text'
    this.text = opts.text ?? 'Text'
    this.fontFamily = opts.fontFamily ?? 'system-ui, sans-serif'
    this.fontSize = opts.fontSize ?? 32
    this.fontStyle = opts.fontStyle ?? 'normal'
    this.align = opts.align ?? 'left'
    this.color = opts.color ?? '#1b1f24'
  }

  private fontString(): string {
    return `${this.fontStyle} ${this.fontSize}px ${this.fontFamily}`
  }

  private _tightCache: {
    key: string
    metrics: { width: number; height: number; left: number; ascent: number }
  } | null = null

  /** Tight ink metrics — pixel-perfect via offscreen scan, fallback to TextMetrics. */
  private tightMetrics(): {
    width: number
    height: number
    left: number
    ascent: number
  } {
    const key = `${this.text}\0${this.fontString()}`
    if (this._tightCache?.key === key) return this._tightCache.metrics

    const compute = (): {
      width: number
      height: number
      left: number
      ascent: number
    } => {
      if (typeof document === 'undefined') {
        return {
          width: this.text.length * this.fontSize * 0.6 || 1,
          height: this.fontSize,
          left: 0,
          ascent: this.fontSize * 0.8,
        }
      }
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return {
          width: this.text.length * this.fontSize * 0.6 || 1,
          height: this.fontSize,
          left: 0,
          ascent: this.fontSize * 0.8,
        }
      }
      const font = this.fontString()
      ctx.font = font
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      const m = ctx.measureText(this.text)
      const wAdv = m.width
      // Try pixel-perfect scan first for true ink hug (removes gap before first glyph)
      try {
        const ascentHint =
          (m as unknown as { actualBoundingBoxAscent?: number })
            .actualBoundingBoxAscent ??
          (m as unknown as { fontBoundingBoxAscent?: number })
            .fontBoundingBoxAscent ??
          this.fontSize * 0.8
        const descentHint =
          (m as unknown as { actualBoundingBoxDescent?: number })
            .actualBoundingBoxDescent ??
          (m as unknown as { fontBoundingBoxDescent?: number })
            .fontBoundingBoxDescent ??
          this.fontSize * 0.2
        const pad = 4
        const cw = Math.ceil((wAdv || this.fontSize) + pad * 2 + 20)
        const ch = Math.ceil(ascentHint + descentHint + pad * 2 + 20)
        // Re-create after resize (resets ctx)
        canvas.width = cw
        canvas.height = ch
        const ctx2 = canvas.getContext('2d')!
        ctx2.font = font
        ctx2.textBaseline = 'alphabetic'
        ctx2.textAlign = 'left'
        ctx2.fillStyle = '#000'
        const x0 = pad + 5
        const y0 = pad + 5 + ascentHint
        // Clear and draw
        ctx2.clearRect(0, 0, cw, ch)
        if (this.text) ctx2.fillText(this.text, x0, y0)
        const img = ctx2.getImageData(0, 0, cw, ch)
        let minX = cw,
          maxX = -1,
          minY = ch,
          maxY = -1
        const data = img.data
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const a = data[(y * cw + x) * 4 + 3]
            if (a > 8) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          const tightW = maxX - minX + 1
          const tightH = maxY - minY + 1
          const left = minX - x0
          const ascent = y0 - minY
          // Guard against degenerate 1px noise
          if (tightW > 0 && tightH > 0) {
            return { width: tightW, height: tightH, left, ascent }
          }
        }
      } catch {}
      // Fallback to TextMetrics
      const left =
        (m as unknown as { actualBoundingBoxLeft?: number })
          .actualBoundingBoxLeft ?? 0
      const right =
        (m as unknown as { actualBoundingBoxRight?: number })
          .actualBoundingBoxRight ?? wAdv
      const ascent =
        (m as unknown as { actualBoundingBoxAscent?: number })
          .actualBoundingBoxAscent ??
        (m as unknown as { fontBoundingBoxAscent?: number })
          .fontBoundingBoxAscent ??
        this.fontSize * 0.8
      const descent =
        (m as unknown as { actualBoundingBoxDescent?: number })
          .actualBoundingBoxDescent ??
        (m as unknown as { fontBoundingBoxDescent?: number })
          .fontBoundingBoxDescent ??
        this.fontSize * 0.2
      const tightW = right - left
      const tightH = ascent + descent
      if (!Number.isFinite(tightW) || tightW <= 0) {
        return {
          width: wAdv || 1,
          height: this.fontSize,
          left: 0,
          ascent: ascent || this.fontSize * 0.8,
        }
      }
      if (!Number.isFinite(tightH) || tightH <= 0) {
        return { width: tightW || wAdv, height: this.fontSize, left, ascent }
      }
      return { width: tightW, height: tightH, left, ascent }
    }

    const metrics = compute()
    this._tightCache = { key, metrics }
    return metrics
  }

  protected get localBounds(): Bounds {
    const m = this.tightMetrics()
    return { x: 0, y: 0, width: m.width, height: m.height }
  }

  get bounds(): Bounds {
    const b = this.localBounds
    return { x: this.x, y: this.y, width: b.width, height: b.height }
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    const m = this.tightMetrics()
    ctx.font = this.fontString()
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = this.color

    if (this.style.fill) {
      // Tight background — hugs ink, not em box
      ctx.fillStyle = this.style.fill
      const b = this.localBounds
      ctx.fillRect(0, 0, b.width, b.height)
      ctx.fillStyle = this.color
    }

    const drawX = -m.left
    const drawY = m.ascent
    if (this.style.stroke && this.style.strokeWidth > 0) {
      ctx.lineWidth = this.style.strokeWidth
      ctx.strokeStyle = this.style.stroke
      ctx.strokeText(this.text, drawX, drawY)
    }

    ctx.fillText(this.text, drawX, drawY)
  }

  protected hitTestLocal(p: Point): boolean {
    const b = this.localBounds
    return p.x >= 0 && p.y >= 0 && p.x <= b.width && p.y <= b.height
  }

  protected cloneSelf(): TextElement {
    return new TextElement(
      this.x,
      this.y,
      {
        text: this.text,
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        fontStyle: this.fontStyle,
        align: this.align,
        color: this.color,
      },
      this.style
    )
  }
}
