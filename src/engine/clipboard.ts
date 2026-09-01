import type { Scene } from './Scene'
import type { BaseElement } from './BaseElement'
import { ArtboardElement } from '../elements/ArtboardElement'

export class Clipboard {
  private buffer: BaseElement[] = []

  copy(scene: Scene): boolean {
    const selected = scene.selected
    if (selected.length === 0) return false
    // Clone selected top-level elements; for artboards, include children as separate entries
    // but they will be handled on paste via artboardId remapping
    this.buffer = selected.map((el) => el.clone())
    // Also include children of selected artboards that are assigned, as separate buffer entries
    // They will be pasted and reassigned to the new artboard clone
    for (const sel of selected) {
      if (sel instanceof ArtboardElement) {
        for (const child of scene.all) {
          if (child.artboardId === sel.id && !selected.includes(child)) {
            this.buffer.push(child.clone())
          }
        }
      }
    }
    return true
  }

  paste(scene: Scene, offsetX = 20, offsetY = 20): BaseElement[] | null {
    if (this.buffer.length === 0) return null
    const idMap = new Map<string, string>()
    const clones: BaseElement[] = []

    // First pass: clone all buffered elements with new IDs and offset
    for (const src of this.buffer) {
      const clone = src.clone()
      clone.moveTo(clone.x + offsetX, clone.y + offsetY)
      // Remember mapping from original buffered ID to new clone ID for artboard reassignment
      idMap.set(src.id, clone.id)
      clones.push(clone)
    }

    // Second pass: fix artboardId for children that were assigned to a buffered artboard
    for (const clone of clones) {
      if (clone.artboardId && idMap.has(clone.artboardId)) {
        clone.artboardId = idMap.get(clone.artboardId)!
      }
    }

    // Add to scene and select
    for (const c of clones) scene.add(c)
    scene.clearSelection()
    for (const c of clones) {
      // Only select top-level (not children that were auto-included via artboard)
      // For simplicity, select all clones
      scene.select(c, true)
    }
    return clones
  }

  hasData(): boolean {
    return this.buffer.length > 0
  }

  clear(): void {
    this.buffer = []
  }
}
