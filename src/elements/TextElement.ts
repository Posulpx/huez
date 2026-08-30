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

  /** Tight ink metrics — uses TextMetrics.actualBoundingBox* when available. */
  private tightMetrics(): {
    width: number
    height: number
    left: number
    ascent: number
  } {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) {
      return {
        width: this.text.length * this.fontSize * 0.6,
        height: this.fontSize,
        left: 0,
        ascent: this.fontSize * 0.8,
      }
    }
    ctx.font = this.fontString()
    // Use alphabetic baseline for stable ascent/descent
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const m = ctx.measureText(this.text)
    const w = m.width
    // Prefer actual ink box, fall back to font box
    const left =
      (m as unknown as { actualBoundingBoxLeft?: number })
        .actualBoundingBoxLeft ?? 0
    const right =
      (m as unknown as { actualBoundingBoxRight?: number })
        .actualBoundingBoxRight ?? w
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
    // Guard against empty string or degenerate metrics
    if (!Number.isFinite(tightW) || tightW <= 0) {
      return {
        width: w || 1,
        height: this.fontSize,
        left: 0,
        ascent: ascent || this.fontSize * 0.8,
      }
    }
    if (!Number.isFinite(tightH) || tightH <= 0) {
      return { width: tightW || w, height: this.fontSize, left, ascent }
    }
    return { width: tightW, height: tightH, left, ascent }
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
