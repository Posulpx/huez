import type { Scene } from '../engine/Scene'
import { booleanOp } from '../engine/booleanOps'

/**
 * Left-sidebar boolean operation panel. Shows Add / Subtract / Intersect
 * when exactly 2 closed shapes/paths are selected; otherwise shows a hint.
 * Lives in its own panel below the tool palette.
 */
export class BooleanPanel {
  private container: HTMLElement

  constructor(
    private root: HTMLElement,
    private scene: Scene,
    private requestRender: () => void
  ) {
    this.container = document.createElement('div')
    this.container.className = 'boolean-panel'
    this.root.appendChild(this.container)
    this.scene.subscribe(() => this.render())
    this.render()
  }

  private render(): void {
    const selected = this.scene.selected
    this.container.innerHTML = ''

    const title = document.createElement('h2')
    title.className = 'panel-title'
    title.textContent = 'Boolean'
    this.container.appendChild(title)

    if (selected.length !== 2) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent =
        selected.length === 0
          ? 'Select 2 closed shapes/paths to combine.'
          : selected.length === 1
            ? 'Select one more closed shape/path.'
            : `${selected.length} selected — select exactly 2.`
      this.container.appendChild(hint)
      return
    }

    const [a, b] = selected as [(typeof selected)[0], (typeof selected)[0]]
    const hint = document.createElement('span')
    hint.className = 'hint'
    hint.textContent = 'Select 2 closed shapes/paths'
    hint.style.fontSize = '11px'
    hint.style.display = 'block'
    hint.style.marginBottom = '6px'
    this.container.appendChild(hint)

    const btnRow = document.createElement('div')
    btnRow.style.display = 'flex'
    btnRow.style.gap = '6px'
    btnRow.style.flexWrap = 'wrap'

    const mkBtn = (
      label: string,
      op: 'union' | 'intersection' | 'difference',
      title: string
    ) => {
      const btn = document.createElement('button')
      btn.className = 'mini-btn'
      btn.textContent = label
      btn.title = title
      btn.addEventListener('click', () => {
        const result = booleanOp(a!, b!, op)
        if (result === null) {
          hint.textContent = 'Need 2 closed shapes/paths'
          hint.style.color = '#ff6b6b'
          return
        }
        this.scene.remove(a!)
        this.scene.remove(b!)
        if (result.length === 0) {
          hint.textContent = 'Result empty — both removed'
          hint.style.color = '#ff6b6b'
          this.requestRender()
          return
        }
        for (const p of result) this.scene.add(p)
        this.scene.clearSelection()
        for (const p of result) this.scene.select(p, true)
        this.requestRender()
      })
      return btn
    }

    btnRow.appendChild(mkBtn('Add', 'union', 'Union (A+B)'))
    btnRow.appendChild(
      mkBtn('Subtract', 'difference', 'Subtract B from A (A-B)')
    )
    btnRow.appendChild(mkBtn('Intersect', 'intersection', 'Intersection (A∩B)'))
    this.container.appendChild(btnRow)
  }
}
