import type { Tool, ToolContext } from '../Tool'

/**
 * ExportTool — output to SVG/PNG.
 * Handles exporting the current scene or selected artboard to
 * SVG or PNG. For now, triggers a simple SVG export via
 * serializing the scene's elements.
 */
export class ExportTool implements Tool {
  readonly id = 'export'
  readonly label = 'Export'
  readonly icon = '⤓'
  readonly cursor = 'default'
  readonly category: Tool['category'] = 'workspace'

  onPointerDown(ctx: ToolContext): void {
    // Simple SVG export: serialize scene bounds to SVG string and trigger download
    const svg = this.toSVG(ctx)
    this.download(svg, 'huez-export.svg')
    ctx.requestRender()
  }

  onPointerMove(): void {}
  onPointerUp(): void {}

  private toSVG(ctx: ToolContext): string {
    const all = ctx.scene.all
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">\n`
    svg += `<rect width="100%" height="100%" fill="#0f1115"/>\n`
    for (const el of all) {
      if (!el.visible) continue
      const b = el.bounds
      if ((el as unknown as { kind?: string }).kind === 'rectangle') {
        svg += `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${el.style.fill ?? 'none'}" stroke="${el.style.stroke ?? 'none'}" />\n`
      } else if ((el as unknown as { kind?: string }).kind === 'ellipse') {
        svg += `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${Math.abs(b.width / 2)}" ry="${Math.abs(b.height / 2)}" fill="${el.style.fill ?? 'none'}" stroke="${el.style.stroke ?? 'none'}" />\n`
      } else {
        svg += `<!-- ${el.name} at ${b.x},${b.y} -->\n`
      }
    }
    svg += `</svg>`
    return svg
  }

  private download(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
