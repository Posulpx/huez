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
        this.tools.setActive(id)
        this.render()
      },
      'select'
    )
    new LayerPanel(layersRoot, this.scene, () => this.render())
    new PropertiesPanel(propsRoot, this.scene, () => this.render())
    new ActivityPanel(activityRoot)

    this.scene.subscribe(() => this.render())
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

    // Double-click on a text element enters in-line edit — ink stays steady, box hidden
    canvas.addEventListener('dblclick', (e) => {
      const world = this.renderer.toWorld(e.clientX, e.clientY)
      const hit = this.scene.hitTest(world, this.renderer.scale)
      if (hit instanceof TextElement) {
        e.preventDefault()
        this.scene.select(hit)
        this.textEditor.startEdit(hit)
        this.render()
      }
    })

    // Middle-mouse drag pans the viewport regardless of the active tool.
    canvas.addEventListener('pointerdown', (e) => {
      // If editing, let the textarea handle it — don't start a canvas drag
      if (this.textEditor.isEditing()) {
        // Click outside the textarea will be handled by TextEditor's stage listener to commit
        // If click is on the canvas while editing a different text, commit first
        const world = this.renderer.toWorld(e.clientX, e.clientY)
        const hit = this.scene.hitTest(world, this.renderer.scale)
        if (hit instanceof TextElement && this.textEditor.isEditing(hit)) return
        // Otherwise commit and allow new selection
        this.textEditor.commit()
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
      this.tools.pointerMove(e.clientX, e.clientY, e.shiftKey, e.altKey)
    })

    canvas.addEventListener('pointerup', (e) => {
      if (this.panning) {
        this.panning = false
        this.panLast = null
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

    // Keyboard: forward to the active tool (e.g. Pen tool Enter/Escape).
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
