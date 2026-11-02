// Entry dello script standalone (React incluso nel bundle).
//
//   <div data-badge-3d data-config='{"firstName":"Ada"}' style="height:600px"></div>
//   <script type="module" src="https://cdn.jsdelivr.net/npm/badge-3d/dist/standalone/badge.js"></script>
//
// oppure da JS:  const badge = Badge3D.mount(el, config); badge.update({...}); badge.unmount()
import { createRoot } from 'react-dom/client'
import { Badge3D } from './Badge3D'
import { defaultConfig, resolveConfig } from './defaults'

const MOUNTED = Symbol('badge3d')

/**
 * Monta il badge dentro `el` (elemento o selettore).
 * options: { anchor, events } elementi o selettori (vedi Badge3D.jsx)
 * Restituisce { update(config, options?), unmount() }.
 */
export function mount(el, config = {}, options = {}) {
  const host = typeof el === 'string' ? document.querySelector(el) : el
  if (!host) throw new Error(`badge-3d: element not found: ${el}`)
  if (host[MOUNTED]) host[MOUNTED].unmount()
  const root = createRoot(host)
  let current = { config, options }
  const render = () => root.render(<Badge3D config={current.config} anchor={current.options.anchor} events={current.options.events} />)
  render()
  const handle = {
    update(nextConfig = current.config, nextOptions = current.options) {
      current = { config: nextConfig, options: nextOptions }
      render()
    },
    unmount() {
      root.unmount()
      delete host[MOUNTED]
    },
  }
  host[MOUNTED] = handle
  return handle
}

// config dichiarativa: attributo data-config (JSON) o <script type="application/json"> dentro l'elemento
function readConfig(el) {
  try {
    if (el.dataset.config) return JSON.parse(el.dataset.config)
    const script = el.querySelector('script[type="application/json"]')
    if (script) return JSON.parse(script.textContent)
  } catch (err) {
    console.error('badge-3d: invalid JSON config', err)
  }
  return {}
}

export function autoMount(root = document) {
  return [...root.querySelectorAll('[data-badge-3d], #badge-3d')]
    .filter((el) => !el[MOUNTED])
    .map((el) => mount(el, readConfig(el), { anchor: el.dataset.anchor, events: el.dataset.events }))
}

export { defaultConfig, resolveConfig }

const api = { mount, autoMount, defaultConfig, resolveConfig }
if (typeof window !== 'undefined') {
  window.Badge3D = api
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoMount())
  else autoMount()
  window.dispatchEvent(new CustomEvent('badge3d:ready', { detail: api }))
}
