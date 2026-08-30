import { App } from './ui/App'

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null
  const palette = document.getElementById('tool-palette')
  const layers = document.getElementById('layers')
  const props = document.getElementById('properties')
  const activity = document.getElementById('activity')

  if (!canvas || !palette || !layers || !props || !activity) {
    throw new Error(
      'HueZ: required DOM nodes (#scene, #tool-palette, #layers, #properties, #activity) are missing.'
    )
  }

  new App(canvas, palette, layers, props, activity)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
