import type { Scene } from './Scene'
import type { BaseElement } from './BaseElement'
import { ArtboardElement } from '../elements/ArtboardElement'

export class Clipboard {
  private buffer: { element: BaseElement; sourceArtboardId: string | null }[] =
    []

  copy(scene: Scene): boolean {
    const selected = scene.selected
    if (selected.length === 0) return false
    this.buffer = []
    for (const el of selected) {
      this.buffer.push({ element: el.clone(), sourceArtboardId: el.artboardId })
    }
    for (const sel of selected) {
      if (sel instanceof ArtboardElement) {
        for (const child of scene.all) {
          if (child.artboardId === sel.id && !selected.includes(child)) {
            this.buffer.push({
              element: child.clone(),
              sourceArtboardId: child.artboardId,
            })
          }
        }
      }
    }
    return true
  }

  paste(scene: Scene, offsetX = 20, offsetY = 20): BaseElement[] | null {
    if (this.buffer.length === 0) return null

    const selectedArtboards = scene.selected.filter(
      (el): el is ArtboardElement => el instanceof ArtboardElement
    )

    // If one or more dashboards (artboards) are selected, paste to each
    // simultaneously, preserving element coordinates relative to source artboard
    if (selectedArtboards.length > 0) {
      const allClones: BaseElement[] = []
      for (const targetAb of selectedArtboards) {
        const idMap = new Map<string, string>()
        const clones: BaseElement[] = []
        for (const entry of this.buffer) {
          // Don't paste artboards onto artboards as children; paste artboards themselves as new artboards offset
          // For artboard entries, offset them relative to target
          const clone = entry.element.clone()
          if (entry.element instanceof ArtboardElement) {
            // Offset artboard itself
            clone.moveTo(clone.x + offsetX, clone.y + offsetY)
          } else {
            // For regular elements, preserve coordinates relative to source artboard
            const sourceAb = entry.sourceArtboardId
              ? scene.getElementById(entry.sourceArtboardId)
              : null
            if (sourceAb instanceof ArtboardElement) {
              // Relative to source artboard
              const relX = entry.element.x - sourceAb.x
              const relY = entry.element.y - sourceAb.y
              clone.moveTo(targetAb.x + relX, targetAb.y + relY)
            } else if (entry.sourceArtboardId === null && targetAb) {
              // Free element pasted onto artboard: keep absolute, but assign to target
              // Preserve absolute coordinates (no offset), just assign
              // clone already at original absolute position, will be assigned below
            } else {
              clone.moveTo(clone.x + offsetX, clone.y + offsetY)
            }
          }
          // Handle artboardId reassignment for pasted artboard itself
          if (clone instanceof ArtboardElement) {
            idMap.set(entry.element.id, clone.id)
          }
          clones.push(clone)
        }
        // Fix artboardId for children that were assigned to a buffered artboard
        for (const clone of clones) {
          if (clone.artboardId && idMap.has(clone.artboardId)) {
            clone.artboardId = idMap.get(clone.artboardId)!
          } else if (!(clone instanceof ArtboardElement)) {
            clone.artboardId = targetAb.id
          }
        }
        for (const c of clones) scene.add(c)
        allClones.push(...clones)
      }
      scene.clearSelection()
      for (const c of allClones) scene.select(c, true)
      return allClones
    }

    // Default: paste with offset, no specific target artboard
    const idMap = new Map<string, string>()
    const clones: BaseElement[] = []
    for (const entry of this.buffer) {
      const clone = entry.element.clone()
      clone.moveTo(clone.x + offsetX, clone.y + offsetY)
      if (clone instanceof ArtboardElement)
        idMap.set(entry.element.id, clone.id)
      clones.push(clone)
    }
    for (const clone of clones) {
      if (clone.artboardId && idMap.has(clone.artboardId)) {
        clone.artboardId = idMap.get(clone.artboardId)!
      }
    }
    for (const c of clones) scene.add(c)
    scene.clearSelection()
    for (const c of clones) scene.select(c, true)
    return clones
  }

  hasData(): boolean {
    return this.buffer.length > 0
  }

  clear(): void {
    this.buffer = []
  }
}
