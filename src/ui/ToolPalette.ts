import type { Tool, ToolCategory } from '../tools/Tool'
import { getRecords, subscribeRecords, type ToolRecord } from '../tools/records'
import type { Scene } from '../engine/Scene'
import { booleanOp } from '../engine/booleanOps'

const CATEGORY_ORDER: ToolCategory[] = ['geometry', 'interaction', 'workspace']
const CATEGORY_LABEL: Record<ToolCategory, string> = {
  geometry: 'Geometry',
  interaction: 'Interaction',
  workspace: 'Workspace',
}
const CATEGORY_HINT: Record<ToolCategory, string> = {
  geometry: 'Circle, Rect, Line, Pen, Text',
  interaction: 'Pan, Select, Zoom, Fit',
  workspace: 'Artboard, Guide (future)',
}
const STORAGE_KEY = 'huez:tool-groups:collapsed'

/**
 * Left-hand palette with collapsible groups. Group wiring is derived from
 * `Tool.category` — Geometry (shapes/pen/text), Interaction (select/pan/zoom),
 * Workspace (artboard/guide). Collapsed state is persisted to localStorage.
 */
export class ToolPalette {
  private buttons = new Map<string, HTMLButtonElement>()
  private groupBodies = new Map<ToolCategory, HTMLElement>()
  private groupRoots = new Map<ToolCategory, HTMLElement>()
  private collapsed = new Set<ToolCategory>()
  private lister: HTMLElement
  private booleanContainer: HTMLElement | null = null

  constructor(
    private root: HTMLElement,
    tools: Tool[],
    private onSelect: (id: string) => void,
    initialId: string,
    private scene?: Scene,
    private requestRender?: () => void,
    private history?: import('../engine/history').History
  ) {
    this.loadCollapsed()
    this.root.innerHTML = ''

    const title = document.createElement('h2')
    title.className = 'panel-title'
    title.textContent = 'Tools'
    this.root.appendChild(title)

    // Group tools by category — wiring fix: rely on Tool.category, not id heuristics
    const grouped = new Map<ToolCategory, Tool[]>()
    for (const cat of CATEGORY_ORDER) grouped.set(cat, [])
    for (const t of tools) {
      const cat: ToolCategory = (t.category as ToolCategory) ?? 'interaction'
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(t)
    }

    for (const cat of CATEGORY_ORDER) {
      const list = grouped.get(cat) ?? []
      // Keep workspace visible even when empty as a future drop target (shows hint)
      if (list.length === 0 && cat !== 'workspace') continue
      this.renderGroup(cat, list)
    }

    // Boolean sub-panel next to Workspace (only when scene provided)
    if (this.scene && this.requestRender) {
      this.renderBooleanSubPanel()
      this.scene.subscribe(() => this.renderBooleanSubPanel())
    }

    // Tool lister lives at the bottom of the sidebar.
    const listerTitle = document.createElement('h2')
    listerTitle.className = 'panel-title lister-title'
    listerTitle.textContent = 'Tool lister'
    this.root.appendChild(listerTitle)

    this.lister = document.createElement('div')
    this.lister.className = 'tool-lister'
    this.root.appendChild(this.lister)

    subscribeRecords(() => this.renderLister())
    this.renderLister()

    this.select(initialId)
  }

  private renderBooleanSubPanel(): void {
    if (!this.scene || !this.requestRender) return
    // Remove existing boolean container if any
    if (this.booleanContainer) {
      this.booleanContainer.remove()
      this.booleanContainer = null
    }
    const workspaceBody = this.groupBodies.get('workspace')
    const workspaceGroup = this.groupRoots.get('workspace')
    if (!workspaceBody || !workspaceGroup) return

    const container = document.createElement('div')
    container.className = 'boolean-subpanel'
    container.style.marginTop = '8px'
    container.style.padding = '8px'
    container.style.background = 'var(--panel-2)'
    container.style.border = '1px solid var(--border)'
    container.style.borderRadius = '8px'

    const title = document.createElement('div')
    title.className = 'section-title'
    title.textContent = 'Boolean'
    title.style.margin = '0 0 6px'
    title.style.padding = '0'
    title.style.border = 'none'
    container.appendChild(title)

    const selected = this.scene!.selected
    const hint = document.createElement('span')
    hint.className = 'hint'
    hint.style.fontSize = '11px'
    hint.style.display = 'block'
    hint.style.marginBottom = '6px'

    if (selected.length !== 2) {
      hint.textContent =
        selected.length === 0
          ? 'Select 2 closed shapes/paths.'
          : selected.length === 1
            ? 'Select one more.'
            : `${selected.length} selected — need exactly 2.`
      container.appendChild(hint)
      workspaceBody.appendChild(container)
      this.booleanContainer = container
      return
    }

    const [a, b] = selected as [(typeof selected)[0], (typeof selected)[0]]
    hint.textContent = 'Combine 2 closed shapes/paths'
    container.appendChild(hint)

    const btnRow = document.createElement('div')
    btnRow.style.display = 'flex'
    btnRow.style.gap = '6px'
    btnRow.style.flexWrap = 'wrap'
    btnRow.style.marginTop = '6px'

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
        this.history?.push()
        this.scene!.remove(a!)
        this.scene!.remove(b!)
        if (result.length === 0) {
          hint.textContent = 'Result empty — both removed'
          hint.style.color = '#ff6b6b'
          this.requestRender!()
          return
        }
        for (const p of result) this.scene!.add(p)
        this.scene!.clearSelection()
        for (const p of result) this.scene!.select(p, true)
        this.requestRender!()
      })
      return btn
    }

    btnRow.appendChild(mkBtn('Add', 'union', 'Union (A+B)'))
    btnRow.appendChild(
      mkBtn('Subtract', 'difference', 'Subtract B from A (A-B)')
    )
    btnRow.appendChild(mkBtn('Intersect', 'intersection', 'Intersection (A∩B)'))
    container.appendChild(btnRow)
    workspaceBody.appendChild(container)
    this.booleanContainer = container
  }

  private renderGroup(cat: ToolCategory, tools: Tool[]): void {
    const group = document.createElement('div')
    group.className = 'tool-group'
    group.dataset.category = cat

    const isCollapsed = this.collapsed.has(cat)
    if (isCollapsed) group.classList.add('collapsed')

    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'tool-group-header'
    header.title = CATEGORY_HINT[cat]
    header.setAttribute('aria-expanded', String(!isCollapsed))

    const label = document.createElement('span')
    label.className = 'tool-group-label'
    label.textContent = CATEGORY_LABEL[cat]

    const count = document.createElement('span')
    count.className = 'tool-group-count'
    count.textContent = String(tools.length)

    const arrow = document.createElement('span')
    arrow.className = 'tool-group-arrow'
    arrow.textContent = '▾'
    arrow.setAttribute('aria-hidden', 'true')

    header.appendChild(label)
    header.appendChild(count)
    header.appendChild(arrow)

    const body = document.createElement('div')
    body.className = 'tool-group-body'

    if (tools.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'tool-group-empty'
      empty.textContent = cat === 'workspace' ? 'Guide — coming soon' : '—'
      body.appendChild(empty)
    } else {
      const grid = document.createElement('div')
      grid.className = 'tool-grid'
      for (const tool of tools) {
        const btn = document.createElement('button')
        btn.className = 'tool-btn'
        btn.title = `${tool.label} — ${CATEGORY_LABEL[cat]}`
        btn.dataset.toolId = tool.id
        btn.innerHTML = `<span class="tool-icon">${tool.icon}</span><span class="tool-label">${tool.label}</span>`
        btn.addEventListener('click', () => this.select(tool.id))
        grid.appendChild(btn)
        this.buttons.set(tool.id, btn)
      }
      body.appendChild(grid)
    }

    header.addEventListener('click', () => this.toggle(cat))

    group.appendChild(header)
    group.appendChild(body)
    this.root.appendChild(group)
    this.groupBodies.set(cat, body)
    this.groupRoots.set(cat, group)
  }

  private toggle(cat: ToolCategory): void {
    const group = this.groupRoots.get(cat)
    const body = this.groupBodies.get(cat)
    if (!group || !body) return
    const nextCollapsed = !group.classList.contains('collapsed')
    group.classList.toggle('collapsed', nextCollapsed)
    group
      .querySelector('.tool-group-header')
      ?.setAttribute('aria-expanded', String(!nextCollapsed))
    if (nextCollapsed) this.collapsed.add(cat)
    else this.collapsed.delete(cat)
    this.saveCollapsed()
  }

  private loadCollapsed(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const arr = JSON.parse(raw) as string[]
      for (const v of arr) {
        if ((CATEGORY_ORDER as string[]).includes(v))
          this.collapsed.add(v as ToolCategory)
      }
    } catch {}
  }

  private saveCollapsed(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collapsed]))
    } catch {}
  }

  select(id: string): void {
    for (const [key, btn] of this.buttons) {
      btn.classList.toggle('active', key === id)
    }
    // Ensure the active tool's group is expanded — wiring fix: never hide the active tool
    const activeBtn = this.buttons.get(id)
    if (activeBtn) {
      const group = activeBtn.closest('.tool-group') as HTMLElement | null
      if (group?.classList.contains('collapsed')) {
        const cat = group.dataset.category as ToolCategory | undefined
        if (cat) this.toggle(cat)
        // toggle already expanded; ensure active stays visible
        group.classList.remove('collapsed')
        this.collapsed.delete(cat!)
        this.saveCollapsed()
        group
          .querySelector('.tool-group-header')
          ?.setAttribute('aria-expanded', 'true')
      }
    }
    this.onSelect(id)
  }

  private renderLister(): void {
    const records = getRecords()
    this.lister.innerHTML = ''
    for (const rec of records) {
      this.lister.appendChild(this.listerRow(rec))
    }
  }

  private listerRow(rec: ToolRecord): HTMLElement {
    const row = document.createElement('button')
    row.className = 'lister-row'
    if (rec.active) row.classList.add('active')
    row.title = `Activate ${rec.label}`
    row.addEventListener('click', () => this.select(rec.id))

    const head = document.createElement('div')
    head.className = 'lister-head'

    const name = document.createElement('span')
    name.className = 'lister-name'
    name.textContent = rec.label

    const meta = document.createElement('span')
    meta.className = 'lister-meta'
    meta.textContent = rec.active ? 'active' : `used ${rec.used}×`

    const dot = document.createElement('span')
    dot.className = `lister-dot ${rec.active ? 'on' : 'off'}`

    head.appendChild(dot)
    head.appendChild(name)
    head.appendChild(meta)

    row.appendChild(head)
    row.appendChild(this.propsBlock('shared', rec.shared))
    row.appendChild(this.propsBlock('specific', rec.specific))

    return row
  }

  private propsBlock(kind: string, bag: Record<string, string>): HTMLElement {
    const block = document.createElement('div')
    block.className = `lister-props ${kind}`
    const keys = Object.keys(bag)
    if (keys.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'lister-prop-empty'
      empty.textContent = `${kind}: —`
      block.appendChild(empty)
      return block
    }
    for (const k of keys) {
      const item = document.createElement('span')
      item.className = 'lister-prop'
      const keyEl = document.createElement('i')
      keyEl.textContent = k
      item.appendChild(keyEl)
      item.appendChild(document.createTextNode(` ${bag[k] ?? ''}`))
      block.appendChild(item)
    }
    return block
  }
}
