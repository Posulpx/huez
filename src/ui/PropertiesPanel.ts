import type { Scene } from '../engine/Scene'
import type { BaseElement } from '../engine/BaseElement'
import { TextElement } from '../elements/TextElement'
import { ShapeElement } from '../elements/ShapeElement'
import { ArtboardElement } from '../elements/ArtboardElement'
import { setElementAnchor } from '../engine/anchor'
import { shapeToPath } from '../engine/shapeToPath'
import type { AnchorPoint, ElementStyle } from '../engine/types'

/**
 * Right-hand sidebar that edits the active selection's visual style:
 * fills, strokes, opacity, and drop shadows. Rebuilds its controls
 * whenever the selection changes. Live edits call `requestRender` so the
 * canvas updates without forcing a panel rebuild (keeps inputs focused).
 */
export class PropertiesPanel {
  constructor(
    private root: HTMLElement,
    private scene: Scene,
    private requestRender: () => void
  ) {
    this.scene.subscribe(() => this.render())
    this.render()
  }

  private render(): void {
    const selected = this.scene.selected
    this.root.innerHTML = ''

    const title = document.createElement('h2')
    title.className = 'panel-title'
    title.textContent = 'Properties'
    this.root.appendChild(title)

    if (selected.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'Select an element to edit its properties.'
      this.root.appendChild(empty)
      return
    }

    if (selected.length > 1) {
      const multi = document.createElement('p')
      multi.className = 'hint'
      multi.textContent = `${selected.length} elements selected.`
      this.root.appendChild(multi)
      return
    }

    const el = selected[0]!
    this.buildCommon(el)

    if (el instanceof ShapeElement) {
      this.root.appendChild(this.convertRow(el))
    }

    if (el instanceof TextElement) {
      this.buildText(el)
    }
  }

  private buildCommon(el: BaseElement): void {
    const s = el.style

    this.root.appendChild(this.nameRow(el))

    if (!(el instanceof ArtboardElement)) {
      this.root.appendChild(this.artboardRow(el))
      if (el.artboardId) this.root.appendChild(this.anchorRow(el))
    }

    this.root.appendChild(
      this.colorRow(
        'Fill',
        s.fill ?? '#000000',
        (v) => {
          s.fill = v
          this.requestRender()
        },
        () => {
          s.fill = null
          this.requestRender()
        }
      )
    )

    this.root.appendChild(
      this.colorRow(
        'Stroke',
        s.stroke ?? '#000000',
        (v) => {
          s.stroke = v
          this.requestRender()
        },
        () => {
          s.stroke = null
          this.requestRender()
        }
      )
    )

    this.root.appendChild(
      this.rangeRow('Stroke width', 0, 40, 1, s.strokeWidth, (v) => {
        s.strokeWidth = v
        this.requestRender()
      })
    )

    this.root.appendChild(
      this.rangeRow('Opacity', 0, 1, 0.01, s.opacity, (v) => {
        s.opacity = v
        this.requestRender()
      })
    )

    if (!(el instanceof ArtboardElement)) {
      this.root.appendChild(
        this.rangeRow('Rotation', 0, Math.PI * 2, 0.01, el.rotation, (v) => {
          el.rotation = v
          this.requestRender()
        })
      )
    }

    this.root.appendChild(this.sectionTitle('Drop Shadow'))

    this.root.appendChild(
      this.checkboxRow('Enable shadow', s.shadow.enabled, (v) => {
        s.shadow.enabled = v
        this.requestRender()
      })
    )

    this.root.appendChild(
      this.colorRow('Shadow color', s.shadow.color, (v) => {
        s.shadow.color = v
        this.requestRender()
      })
    )

    this.root.appendChild(
      this.rangeRow('Blur', 0, 60, 1, s.shadow.blur, (v) => {
        s.shadow.blur = v
        this.requestRender()
      })
    )

    this.root.appendChild(
      this.rangeRow('Offset X', -40, 40, 1, s.shadow.offsetX, (v) => {
        s.shadow.offsetX = v
        this.requestRender()
      })
    )

    this.root.appendChild(
      this.rangeRow('Offset Y', -40, 40, 1, s.shadow.offsetY, (v) => {
        s.shadow.offsetY = v
        this.requestRender()
      })
    )

    const del = document.createElement('button')
    del.className = 'danger-btn'
    del.textContent = 'Delete element'
    del.addEventListener('click', () => this.scene.remove(el))
    this.root.appendChild(del)
  }

  private buildText(el: TextElement): void {
    this.root.appendChild(this.sectionTitle('Text'))
    this.root.appendChild(
      this.textRow('Content', el.text, (v) => {
        el.text = v
        this.requestRender()
      })
    )
    this.root.appendChild(
      this.rangeRow('Font size', 8, 200, 1, el.fontSize, (v) => {
        el.fontSize = v
        this.requestRender()
      })
    )
  }

  private sectionTitle(text: string): HTMLElement {
    const h = document.createElement('h3')
    h.className = 'section-title'
    h.textContent = text
    return h
  }

  private colorRow(
    label: string,
    value: string,
    onInput: (v: string) => void,
    onClear?: () => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = label

    const wrap = document.createElement('div')
    wrap.className = 'prop-controls'

    const input = document.createElement('input')
    input.type = 'color'
    input.value = toHex(value)
    input.addEventListener('input', () => onInput(input.value))

    wrap.appendChild(input)

    if (onClear) {
      const none = document.createElement('button')
      none.className = 'mini-btn'
      none.textContent = 'None'
      none.addEventListener('click', () => {
        onClear()
        input.value = '#000000'
      })
      wrap.appendChild(none)
    }

    row.appendChild(lab)
    row.appendChild(wrap)
    return row
  }

  private rangeRow(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (v: number) => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = label

    const wrap = document.createElement('div')
    wrap.className = 'prop-controls'

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)

    const val = document.createElement('span')
    val.className = 'prop-value'
    val.textContent = formatNum(value)

    input.addEventListener('input', () => {
      const n = Number(input.value)
      val.textContent = formatNum(n)
      onInput(n)
    })

    wrap.appendChild(input)
    wrap.appendChild(val)
    row.appendChild(lab)
    row.appendChild(wrap)
    return row
  }

  private checkboxRow(
    label: string,
    value: boolean,
    onChange: (v: boolean) => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = label

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = value
    input.addEventListener('change', () => onChange(input.checked))

    row.appendChild(lab)
    row.appendChild(input)
    return row
  }

  private textRow(
    label: string,
    value: string,
    onInput: (v: string) => void
  ): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = label

    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.addEventListener('input', () => onInput(input.value))

    row.appendChild(lab)
    row.appendChild(input)
    return row
  }

  private nameRow(el: BaseElement): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = 'Name'

    const input = document.createElement('input')
    input.type = 'text'
    input.value = el.name
    input.addEventListener('change', () =>
      this.scene.rename(el, input.value || el.name)
    )

    row.appendChild(lab)
    row.appendChild(input)
    return row
  }

  /** Assign the selected element to an artboard (or leave it free). */
  private artboardRow(el: BaseElement): HTMLElement {
    const row = document.createElement('div')
    row.className = 'prop-row'

    const lab = document.createElement('label')
    lab.textContent = 'Artboard'

    const select = document.createElement('select')
    select.className = 'prop-select'

    const none = document.createElement('option')
    none.value = ''
    none.textContent = '— none (free) —'
    select.appendChild(none)

    for (const ab of this.scene.artboards) {
      const opt = document.createElement('option')
      opt.value = ab.id
      opt.textContent = ab.name
      if (el.artboardId === ab.id) opt.selected = true
      select.appendChild(opt)
    }

    select.addEventListener('change', () => {
      this.scene.assignToArtboard(el, select.value || null)
      this.requestRender()
    })

    if (this.scene.artboards.length === 0) {
      select.disabled = true
      none.textContent = '— create an artboard first —'
    }

    row.appendChild(lab)
    row.appendChild(select)
    return row
  }

  /** 3x3 anchor picker — positions the element relative to its artboard. */
  private anchorRow(el: BaseElement): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'prop-row anchor-row'

    const lab = document.createElement('label')
    lab.textContent = 'Anchor'
    wrap.appendChild(lab)

    const grid = document.createElement('div')
    grid.className = 'anchor-grid'

    const order: AnchorPoint[] = [
      'nw',
      'n',
      'ne',
      'w',
      'center',
      'e',
      'sw',
      's',
      'se',
    ]

    for (const point of order) {
      const btn = document.createElement('button')
      btn.className = 'anchor-btn' + (el.anchor === point ? ' active' : '')
      btn.type = 'button'
      btn.title = point
      // A small glyph showing where the dot sits in the cell.
      btn.textContent = '•'
      btn.dataset.anchor = point
      btn.addEventListener('click', () => {
        setElementAnchor(el, point)
        this.requestRender()
        this.render()
      })
      grid.appendChild(btn)
    }

    wrap.appendChild(grid)
    return wrap
  }

  private convertRow(el: ShapeElement): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'prop-row'
    const btn = document.createElement('button')
    btn.className = 'mini-btn'
    btn.textContent = 'Convert to Path'
    btn.title = 'Convert primitive to editable path'
    btn.addEventListener('click', () => {
      const path = shapeToPath(el)
      this.scene.replace(el, path)
      this.scene.select(path)
      this.requestRender()
    })
    wrap.appendChild(btn)
    const hint = document.createElement('span')
    hint.className = 'hint'
    hint.textContent = 'Editable path'
    hint.style.marginLeft = '8px'
    wrap.appendChild(hint)
    return wrap
  }
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Best-effort conversion of an rgba()/named color to a hex for <input type=color>. */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = color
  const computed = ctx.fillStyle
  if (/^#[0-9a-f]{6}$/i.test(computed)) return computed
  return '#000000'
}

export type { ElementStyle }
