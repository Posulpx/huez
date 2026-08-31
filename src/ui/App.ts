import { Scene } from '../engine/Scene'
import { ArtboardElement } from '../elements/ArtboardElement'
import { CanvasRenderer } from '../engine/CanvasRenderer'
import { ToolManager } from '../tools/ToolManager'
import { SelectTool } from '../tools/SelectTool'
import { ShapeTool } from '../tools/ShapeTool'
import { TextTool } from '../tools/TextTool'
import { ArtboardTool } from '../tools/ArtboardTool'
import { PanTool } from '../tools/PanTool'
import { PenTool } from '../tools/PenTool'
import { ToolPalette } from './ToolPalette'
import { PropertiesPanel } from './PropertiesPanel'
import { LayerPanel } from './LayerPanel'
import { ActivityPanel } from './ActivityPanel'
import { TextEditor } from './TextEditor'
import { TextElement } from '../elements/TextElement'
import { PathEditor } from './PathEditor'
import { PathElement } from '../elements/PathElement'

/**
 * Top-level application wiring: builds the engine, registers tools,
 * mounts the UI panels, and forwards canvas pointer events to the
 * active tool.
 */
export class App {
  private scene = new Scene()
  private renderer: CanvasRenderer
  private tools: ToolManager
  private textEditor: TextEditor
  private pathEditor: PathEditor
  private panning = false
  private panLast: { x: number; y: number } | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    paletteRoot: HTMLElement,
    layersRoot: HTMLElement,
    propsRoot: HTMLElement,
    activityRoot: HTMLElement
  ) {
    this.renderer = new CanvasRenderer(canvas)
    this.tools = new ToolManager(this.scene, this.renderer, () => this.render())
    const stage = canvas.parentElement as HTMLElement
    this.textEditor = new TextEditor(stage, this.scene, this.renderer, () =>
      this.render()
    )
    this.pathEditor = new PathEditor(this.scene, this.renderer, () =>
      this.render()
    )

    this.registerTools()

    // Seed an A4-sized artboard (794×1123 px ≈ 210×297 mm @ 96 DPI) as the
    // initial canvas, numbered "Artboard 1".
    const a4 = new ArtboardElement(120, 120, 794, 1123)
    a4.name = 'Artboard 1'
    this.scene.add(a4)

    new ToolPalette(
      paletteRoot,
      this.tools.list(),
      (id) => {
        // Commit any in-line text edit before switching tools — keeps ink steady
        if (this.textEditor.isEditing()) this.textEditor.commit()
        if (this.pathEditor.isEditing()) this.pathEditor.commit()
        this.tools.setActive(id)
        this.render()
      },
      'select'
    )
    new LayerPanel(layersRoot, this.scene, () => this.render())
    new PropertiesPanel(propsRoot, this.scene, () => this.render())
    new ActivityPanel(activityRoot)

    this.scene.subscribe(() => this.render())
    // Auto-commit path edit if the edited path is deselected externally
    this.scene.subscribe(() => {
      if (
        this.pathEditor.isEditing() &&
        this.pathEditor.editing &&
        !this.scene.isSelected(this.pathEditor.editing)
      ) {
        this.pathEditor.commit()
      }
    })
    this.bindCanvas()
    this.bindResize()

    this.render()
  }

  private registerTools(): void {
    this.tools.register(new SelectTool())
    this.tools.register(new ShapeTool('rectangle', 'Rectangle', '▭'))
    this.tools.register(new ShapeTool('ellipse', 'Ellipse', '◯'))
    this.tools.register(new ShapeTool('line', 'Line', '╱'))
    this.tools.register(new TextTool(this.textEditor))
    this.tools.register(new ArtboardTool())
    this.tools.register(new PanTool())
    this.tools.register(new PenTool())
  }

  private bindCanvas(): void {
    const canvas = this.canvas

    // Double-click enters in-line edit (text) or path vertex edit
    canvas.addEventListener('dblclick', (e) => {
      const world = this.renderer.toWorld(e.clientX, e.clientY)
      const scale = this.renderer.scale
      // If already path-editing, a dblclick on an anchor deletes it
      if (this.pathEditor.isEditing()) {
        if (this.pathEditor.handleDoubleClick(world, scale)) {
          e.preventDefault()
          this.render()
          return
        }
        // Dblclick elsewhere while editing commits
        if (this.scene.hitTest(world, scale) instanceof PathElement) {
          // let the path double-click handling below re-enter if needed
        } else {
          // Commit editing on double-click on empty space
          this.pathEditor.commit()
          this.render()
          return
        }
      }
      const hit = this.scene.hitTest(world, scale)
      if (hit instanceof TextElement) {
        e.preventDefault()
        if (this.pathEditor.isEditing()) this.pathEditor.commit()
        this.scene.select(hit)
        this.textEditor.startEdit(hit)
        this.render()
        return
      }
      if (hit instanceof PathElement) {
        // Ignore paths still drafting (pen tool)
        if (hit.drafting) return
        e.preventDefault()
        if (this.textEditor.isEditing()) this.textEditor.commit()
        this.scene.select(hit)
        this.pathEditor.startEdit(hit)
        this.render()
      }
    })

    // Middle-mouse drag pans the viewport regardless of the active tool.
    canvas.addEventListener('pointerdown', (e) => {
      // If text editing, let the textarea handle it — don't start a canvas drag
      if (this.textEditor.isEditing()) {
        // Click outside the textarea will be handled by TextEditor's stage listener to commit
        // If click is on the canvas while editing a different text, commit first
        const world = this.renderer.toWorld(e.clientX, e.clientY)
        const hit = this.scene.hitTest(world, this.renderer.scale)
        if (hit instanceof TextElement && this.textEditor.isEditing(hit)) return
        // Otherwise commit and allow new selection
        this.textEditor.commit()
      }
      // Path vertex editing is exclusive — all left-clicks go to the editor
      if (this.pathEditor.isEditing()) {
        if (e.button === 0) {
          const world = this.renderer.toWorld(e.clientX, e.clientY)
          // Hit anchor/handle or insert on stroke → handled
          if (
            this.pathEditor.handlePointerDown(
              world,
              this.renderer.scale,
              e.altKey
            )
          ) {
            canvas.setPointerCapture(e.pointerId)
            e.preventDefault()
            this.render()
            return
          }
          // Click elsewhere while editing — consume but keep editing (no tool)
          if (this.pathEditor.editing) {
            // Click on empty canvas while editing selects anchor if possible,
            // otherwise stays in edit mode — update selection highlight
            const path = this.pathEditor.editing
            if (path) {
              const hitAnchor = path.hitAnchor(world, this.renderer.scale)
              if (hitAnchor) {
                path.editingSelected = hitAnchor.index
                this.render()
              }
            }
            canvas.setPointerCapture(e.pointerId)
            e.preventDefault()
            return
          }
        }
      }
      if (e.button === 1) {
        canvas.setPointerCapture(e.pointerId)
        this.panning = true
        this.panLast = { x: e.clientX, y: e.clientY }
        e.preventDefault()
        return
      }
      canvas.setPointerCapture(e.pointerId)
      this.tools.pointerDown(e.clientX, e.clientY, e.shiftKey, e.altKey)
    })

    canvas.addEventListener('pointermove', (e) => {
      if (this.panning && this.panLast) {
        const dx = e.clientX - this.panLast.x
        const dy = e.clientY - this.panLast.y
        this.panLast = { x: e.clientX, y: e.clientY }
        this.renderer.pan(dx, dy)
        this.textEditor.sync()
        this.render()
        return
      }
      if (this.pathEditor.isEditing()) {
        const world = this.renderer.toWorld(e.clientX, e.clientY)
        if (this.pathEditor.handlePointerMove(world, e.altKey)) {
          this.render()
          return
        }
        const cur = this.pathEditor.updateCursor(world, this.renderer.scale)
        if (cur) this.renderer.setCursor(cur)
        else this.renderer.setCursor('default')
        return
      }
      this.tools.pointerMove(e.clientX, e.clientY, e.shiftKey, e.altKey)
    })

    canvas.addEventListener('pointerup', (e) => {
      if (this.panning) {
        this.panning = false
        this.panLast = null
        return
      }
      if (this.pathEditor.isEditing()) {
        this.pathEditor.handlePointerUp()
        this.render()
        return
      }
      this.tools.pointerUp(e.clientX, e.clientY, e.shiftKey, e.altKey)
    })

    // Wheel zooms centered on the cursor.
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        this.renderer.zoomAt(e.clientX, e.clientY, factor)
        this.textEditor.sync()
        this.render()
      },
      { passive: false }
    )

    // Keyboard: path editor first, then forward to the active tool (e.g. Pen tool Enter/Escape).
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT')
      ) {
        return
      }
      if (this.pathEditor.isEditing()) {
        if (this.pathEditor.handleKeyDown(e.key)) {
          e.preventDefault()
          this.render()
          return
        }
      }
      this.tools.keyDown(e.key)
    })
  }

  private bindResize(): void {
    const onResize = () => {
      this.renderer.resize()
      this.render()
    }
    window.addEventListener('resize', onResize)
  }

  private render(): void {
    this.renderer.render(this.scene)
    this.textEditor.sync()
  }
}
