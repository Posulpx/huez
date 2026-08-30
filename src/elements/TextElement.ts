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

  protected get localBounds(): Bounds {
    const metrics = this.measure()
    return { x: 0, y: 0, width: metrics.width, height: this.fontSize }
  }

  get bounds(): Bounds {
    const b = this.localBounds
    return { x: this.x, y: this.y, width: b.width, height: b.height }
  }

  private measure(): { width: number } {
    // A throwaway context is the simplest way to get text metrics.
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return { width: this.text.length * this.fontSize * 0.6 }
    ctx.font = this.fontString()
    return { width: ctx.measureText(this.text).width }
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.font = this.fontString()
    ctx.textBaseline = 'top'
    ctx.fillStyle = this.color

    if (this.style.fill) {
      // Painted background behind the text, e.g. a highlight box.
      ctx.fillStyle = this.style.fill
      const b = this.localBounds
      ctx.fillRect(0, 0, b.width, b.height)
      ctx.fillStyle = this.color
    }

    if (this.style.stroke && this.style.strokeWidth > 0) {
      ctx.lineWidth = this.style.strokeWidth
      ctx.strokeStyle = this.style.stroke
      ctx.strokeText(this.text, 0, 0)
    }

    ctx.fillText(this.text, 0, 0)
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
