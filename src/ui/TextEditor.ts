import type { Scene } from '../engine/Scene'
import type { CanvasRenderer } from '../engine/CanvasRenderer'
import { TextElement } from '../elements/TextElement'

/**
 * In-line text editor — shows a <textarea> over the canvas at the text's
 * world position. While editing, the TextElement's `editing` flag is true
 * so the selection overlay (bounding box) is hidden, and the caret (in the
 * DOM) does not affect the canvas bounds. The original ink position stays
 * steady — the textarea is anchored to the element's top-left world
 * coordinate and grows with content, supporting multiline (Enter = newline).
 */
export class TextEditor {
  private overlay: HTMLTextAreaElement | null = null
  private editingEl: TextElement | null = null

  constructor(
    private stage: HTMLElement,
    private scene: Scene,
    private renderer: CanvasRenderer,
    private requestRender: () => void
  ) {
    // Close on click outside
    this.stage.addEventListener('pointerdown', (e) => {
      if (!this.editingEl || !this.overlay) return
      const t = e.target as HTMLElement | null
      if (t === this.overlay || this.overlay.contains(t as Node)) return
      // If click is on canvas and hits the same text, ignore — double-click will handle
      this.commit()
    })
  }

  isEditing(el?: TextElement): boolean {
    if (!el) return !!this.editingEl
    return this.editingEl === el
  }

  startEdit(el: TextElement): void {
    if (this.editingEl === el) return
    this.cancel() // close previous

    this.editingEl = el
    el.editing = true
    // Hide selection overlay for this element — keep ink steady at same world pos
    this.requestRender()

    const ta = document.createElement('textarea')
    ta.className = 'text-editor'
    ta.value = el.text
    ta.rows = Math.max(1, el.text.split('\n').length)
    // Match the element's font
    ta.style.fontFamily = el.fontFamily
    ta.style.fontStyle = el.fontStyle
    ta.style.fontWeight = el.fontStyle === 'bold' ? '700' : '400'
    ta.style.color = el.color
    // Background transparent so original ink shows through? We hide canvas ink
    // while editing (TextElement.render returns early) — textarea is the visible ink.
    // Keep it steady by anchoring to world pos.
    ta.style.background = 'transparent'
    ta.style.border = 'none'
    ta.style.outline = 'none'
    ta.style.resize = 'none'
    ta.style.overflow = 'hidden'
    ta.style.whiteSpace = 'pre-wrap'
    ta.style.wordBreak = 'break-word'
    ta.style.padding = '0'
    ta.style.margin = '0'
    ta.style.caretColor = '#4f8cff'

    this.positionOverlay(ta, el)
    this.stage.appendChild(ta)
    this.overlay = ta
    // Focus and select all for quick replace, but place caret at end for empty
    requestAnimationFrame(() => {
      ta.focus()
      ta.select()
      // Place caret at end
      const len = ta.value.length
      ta.setSelectionRange(len, len)
      this.autoSize()
    })

    const onInput = () => {
      if (!this.editingEl) return
      this.editingEl.text = ta.value
      // Invalidate tight cache is automatic via key change on next tightMetrics()
      this.autoSize()
      this.requestRender()
      // Keep overlay positioned as bounds grow
      if (this.editingEl) this.positionOverlay(ta, this.editingEl)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.cancel()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Enter commits (Enter alone is newline for multiline)
        e.preventDefault()
        this.commit()
      }
      // Stop propagation so canvas shortcuts (e.g., delete) don't fire
      e.stopPropagation()
    }
    const onBlur = () => {
      // Commit on blur (click outside or tab away)
      // Use timeout to allow pointerdown on stage to commit first
      setTimeout(() => {
        if (this.editingEl) this.commit()
      }, 0)
    }

    ta.addEventListener('input', onInput)
    ta.addEventListener('keydown', onKeyDown)
    ta.addEventListener('blur', onBlur)
    // Store for cleanup
    ;(ta as unknown as { _cleanup?: () => void })._cleanup = () => {
      ta.removeEventListener('input', onInput)
      ta.removeEventListener('keydown', onKeyDown)
      ta.removeEventListener('blur', onBlur)
    }

    // Reposition on zoom/pan
    const onViewChange = () => {
      if (this.editingEl && this.overlay)
        this.positionOverlay(this.overlay, this.editingEl)
    }
    // Listen to scene changes that affect view
    window.addEventListener('resize', onViewChange)
    ;(ta as unknown as { _viewCleanup?: () => void })._viewCleanup = () =>
      window.removeEventListener('resize', onViewChange)
  }

  private positionOverlay(ta: HTMLTextAreaElement, el: TextElement): void {
    // World -> screen: screen = world * scale + offset
    const b = el.bounds // tight bounds, top-left is el.x, el.y
    const scale = this.renderer.scale
    const sx = b.x * scale + this.renderer.offsetX
    const sy = b.y * scale + this.renderer.offsetY
    // Size in screen pixels (tight bounds scaled)
    const w = Math.max(20, b.width * scale + 20) // +20 for caret room
    const h = Math.max(20, b.height * scale + 10)
    ta.style.left = `${sx}px`
    ta.style.top = `${sy}px`
    ta.style.width = `${w}px`
    ta.style.height = `${h}px`
    ta.style.fontSize = `${el.fontSize * scale}px`
    ta.style.lineHeight = `${1.2 * el.fontSize * scale}px`
    // Ensure stage is relative for absolute positioning
    this.stage.style.position = 'relative'
  }

  private autoSize(): void {
    if (!this.overlay || !this.editingEl) return
    const ta = this.overlay
    // Auto-grow height to fit content
    ta.style.height = 'auto'
    const scrollH = ta.scrollHeight
    const scale = this.renderer.scale
    const minH = Math.max(20, this.editingEl.bounds.height * scale + 10)
    ta.style.height = `${Math.max(scrollH, minH)}px`
    // Width grows with longest line — already set via positionOverlay, but ensure
    ta.style.width = `${Math.max(20, this.editingEl.bounds.width * scale + 20)}px`
  }

  commit(): void {
    if (!this.editingEl || !this.overlay) return
    const el = this.editingEl
    const ta = this.overlay
    const newText = ta.value
    // Remove overlay first to avoid re-entrant blur
    this.cleanupOverlay()
    el.text = newText
    el.editing = false
    // If text is empty, remove the element (common UX)
    if (!newText.trim()) {
      this.scene.remove(el)
    } else {
      this.scene.select(el)
    }
    this.editingEl = null
    this.requestRender()
    this.scene.subscribe(() => {}) // trigger change
  }

  cancel(): void {
    if (!this.editingEl || !this.overlay) {
      // Still clear editing flag if any
      if (this.editingEl) {
        this.editingEl.editing = false
        this.editingEl = null
        this.requestRender()
      }
      return
    }
    const el = this.editingEl
    const wasNew = el.text === 'Text' && this.overlay.value === 'Text'
    this.cleanupOverlay()
    // If it was a newly created "Text" and user cancelled, remove it
    if (wasNew && el.text === 'Text') {
      // Check if scene still contains it and no change
      if (this.scene.getElementById(el.id)) this.scene.remove(el)
    }
    el.editing = false
    this.editingEl = null
    this.requestRender()
  }

  private cleanupOverlay(): void {
    if (!this.overlay) return
    const ta = this.overlay as unknown as {
      _cleanup?: () => void
      _viewCleanup?: () => void
    }
    ta._cleanup?.()
    ta._viewCleanup?.()
    this.overlay.remove()
    this.overlay = null
  }

  /** Call on zoom/pan to keep overlay aligned. */
  sync(): void {
    if (this.editingEl && this.overlay)
      this.positionOverlay(this.overlay, this.editingEl)
  }
}
