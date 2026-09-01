import type { Scene } from './Scene'
import type { BaseElement } from './BaseElement'

interface Snapshot {
  elements: BaseElement[]
  selectedIds: string[]
}

export class History {
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private maxSize = 50
  private isRestoring = false

  constructor(private scene: Scene) {}

  /** Capture current scene state onto undo stack and clear redo. */
  push(): void {
    if (this.isRestoring) return
    const snap = this.capture()
    this.undoStack.push(snap)
    if (this.undoStack.length > this.maxSize) this.undoStack.shift()
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(): boolean {
    if (!this.canUndo()) return false
    const current = this.capture()
    this.redoStack.push(current)
    const prev = this.undoStack.pop()!
    this.restore(prev)
    return true
  }

  redo(): boolean {
    if (!this.canRedo()) return false
    const current = this.capture()
    this.undoStack.push(current)
    const next = this.redoStack.pop()!
    this.restore(next)
    return true
  }

  private capture(): Snapshot {
    const all = this.scene.all
    const elements = all.map((el) => el.clone())
    // Map old selected IDs to new cloned IDs via index
    const selectedIds: string[] = []
    const selectedSet = new Set(this.scene.selected.map((el) => el.id))
    for (let i = 0; i < all.length; i++) {
      if (selectedSet.has(all[i]!.id)) {
        selectedIds.push(elements[i]!.id)
      }
    }
    return { elements, selectedIds }
  }

  private restore(snap: Snapshot): void {
    this.isRestoring = true
    // Remove all current
    for (const el of [...this.scene.all]) {
      this.scene.remove(el)
    }
    // Add snapshot elements (cloned already, need to re-clone to get fresh instances with same IDs? Use as is)
    for (const el of snap.elements) {
      // el already is a clone with same ID, add directly
      this.scene.add(el)
    }
    // Restore selection
    this.scene.clearSelection()
    for (const id of snap.selectedIds) {
      const el = this.scene.getElementById(id)
      if (el) this.scene.select(el, true)
    }
    this.isRestoring = false
  }
}
