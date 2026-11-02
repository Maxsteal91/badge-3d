import { defaultConfig, mount } from '../src/standalone.jsx'

const CDN = 'https://cdn.jsdelivr.net/npm/badge-3d@0/dist/standalone/badge.js'
const TEXT_FIELDS = ['firstName', 'lastName', 'role', 'company', 'tag', 'lanyardText', 'qr', 'mainLink', 'logo', 'logoMark', 'photo']
const COLOR_FIELDS = Object.keys(defaultConfig.colors)

const form = document.getElementById('form')
const code = document.getElementById('code')
let tab = 'html'

// un selettore di colore per ogni chiave di defaultConfig.colors
document.getElementById('colors').append(...COLOR_FIELDS.map((key) => {
  const label = document.createElement('label')
  const input = Object.assign(document.createElement('input'), { type: 'color', name: `color.${key}` })
  label.append(input, key)
  return label
}))

function fill(cfg) {
  for (const k of TEXT_FIELDS) form.elements[k].value = cfg[k] ?? ''
  form.elements.contacts.value = cfg.contacts.map((c) => `${c.label}: ${c.value}`).join('\n')
  for (const k of COLOR_FIELDS) form.elements[`color.${k}`].value = cfg.colors[k]
  form.elements.iridescence.checked = cfg.iridescence
}

function read() {
  const cfg = { colors: {} }
  for (const k of TEXT_FIELDS) cfg[k] = form.elements[k].value.trim() || null
  for (const k of ['firstName', 'lastName', 'role', 'company', 'tag']) cfg[k] ??= ''
  cfg.contacts = form.elements.contacts.value.split('\n').map((line) => {
    const i = line.indexOf(':')
    return i < 0 ? null : { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() }
  }).filter((c) => c && c.label && c.value)
  for (const k of COLOR_FIELDS) cfg.colors[k] = form.elements[`color.${k}`].value
  cfg.iridescence = form.elements.iridescence.checked
  return cfg
}

// solo i campi diversi dai default: lo snippet resta corto
function diff(cfg) {
  const out = {}
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'colors') {
      const colors = Object.fromEntries(Object.entries(v).filter(([c, val]) => val.toLowerCase() !== defaultConfig.colors[c].toLowerCase()))
      if (Object.keys(colors).length) out.colors = colors
    } else if (JSON.stringify(v) !== JSON.stringify(defaultConfig[k] ?? null)) {
      out[k] = v
    }
  }
  return out
}

function snippet(cfg) {
  const d = diff(cfg)
  if (tab === 'react') {
    const json = JSON.stringify(d, null, 2).replace(/\n/g, '\n  ')
    return `import { Badge3D } from 'badge-3d'\n\nconst config = ${json}\n\nexport function Hero() {\n  return <Badge3D config={config} style={{ height: 600 }} />\n}`
  }
  const json = JSON.stringify(d, null, 2).replace(/</g, '\\u003c')
  return `<div data-badge-3d style="height: 600px">\n  <script type="application/json">\n${json}\n  </script>\n</div>\n<script type="module" src="${CDN}"></script>`
}

const badge = mount('#badge', defaultConfig)
let timer
function refresh() {
  const cfg = read()
  code.textContent = snippet(cfg)
  clearTimeout(timer)
  timer = setTimeout(() => badge.update(cfg), 250)
}

fill(defaultConfig)
code.textContent = snippet(read())
form.addEventListener('input', refresh)
document.getElementById('reset').addEventListener('click', () => {
  fill(defaultConfig)
  refresh()
})
document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
  tab = btn.dataset.tab
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)))
  code.textContent = snippet(read())
}))
document.getElementById('copy').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(code.textContent)
    e.target.textContent = 'Copied'
  } catch {
    e.target.textContent = 'Copy failed'
  }
  setTimeout(() => (e.target.textContent = 'Copy'), 1500)
})
