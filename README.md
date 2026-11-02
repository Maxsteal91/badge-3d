# badge-3d

A draggable 3D conference badge hanging from a physics-driven lanyard, for any website.
Built with [React Three Fiber](https://github.com/pmndrs/react-three-fiber) and [Rapier](https://rapier.rs/).
The card artwork (name, role, contacts, QR code, logo, colors) is drawn at runtime from a plain config object.

**[Live playground →](https://Maxsteal91.github.io/badge-3d/)** – edit the fields and copy the snippet.

<!-- ![badge-3d](docs/screenshot.png) -->

- Drop-in `<script>`: no build step, works on static sites, WordPress, Flask/Django templates, jQuery pages…
- React component for bundler-based projects
- Drag, throw and spin the card; the lanyard twists and follows the page layout
- Renders only while visible, lets the page scroll on touch devices, static image fallback without WebGL

## Quick start (script tag)

```html
<div data-badge-3d style="height: 600px">
  <script type="application/json">
    { "firstName": "Ada", "lastName": "Lovelace", "role": "Analyst", "qr": "https://example.com" }
  </script>
</div>

<script type="module" src="https://cdn.jsdelivr.net/npm/badge-3d@0/dist/standalone/badge.js"></script>
```

The badge fills its container, so give the element a height. Every `[data-badge-3d]` element on the page
is mounted automatically. The config can also be passed as an attribute:
`<div data-badge-3d data-config='{"firstName":"Ada"}'>`.

### Self-hosting

Copy `dist/standalone/` (`badge.js` + `assets/`) anywhere in your site and point the script at it.
Assets are resolved relative to `badge.js`, so the folder works from any path:

```html
<!-- Flask -->
<script type="module" src="{{ url_for('static', filename='badge/badge.js') }}"></script>
```

### JavaScript API

```html
<div id="badge" style="height: 600px"></div>
<script type="module">
  import { mount } from 'https://cdn.jsdelivr.net/npm/badge-3d@0/dist/standalone/badge.js'

  const badge = mount('#badge', { firstName: 'Grace', lastName: 'Hopper' })
  badge.update({ firstName: 'Alan', lastName: 'Turing' })   // replaces the whole config
  badge.unmount()
</script>
```

The module also sets `window.Badge3D = { mount, autoMount, defaultConfig, resolveConfig }` and fires a
`badge3d:ready` event on `window`, for classic (non-module) scripts.

| `mount(el, config, options)` | |
| --- | --- |
| `el` | element or CSS selector |
| `config` | partial config, merged with the defaults (see below) |
| `options.anchor` | element/selector: the lanyard hangs below its horizontal center (default: center of the badge) |
| `options.events` | element/selector that receives pointer events instead of the canvas, so the canvas can overlap text and links without blocking them |

The same options are available declaratively as `data-anchor` and `data-events`.

## React

```bash
npm install badge-3d react react-dom three @react-three/fiber @react-three/drei @react-three/rapier
```

```jsx
import { Badge3D } from 'badge-3d'

export function Hero() {
  return (
    <Badge3D
      style={{ height: 600 }}
      config={{ firstName: 'Ada', lastName: 'Lovelace', colors: { accent: '#e4572e' } }}
    />
  )
}
```

Props: `config`, `anchor`, `events` (element, ref or selector), `className`, `style`.
The config is compared by value, so an inline object does not rebuild the textures on every render.
The 3D model and fonts are inlined in the package: nothing else needs to be served.

## Config

All fields are optional. Defaults live in [`src/defaults.js`](src/defaults.js).

| Field | Default | Description |
| --- | --- | --- |
| `firstName`, `lastName` | `"Jane"`, `"Doe"` | Big name on the front |
| `role` | `"Software Engineer"` | Line under the name |
| `company` | `"Acme Inc."` | Shown when no `logo` is set |
| `tag` | `"CONF 2026"` | Small monospace text, top right |
| `contacts` | 3 sample rows | `[{ label, value }]`, printed at the bottom of the front |
| `qr` | `"https://example.com"` | QR code content, `null` to hide |
| `mainLink` | `"https://example.com"` | Printed on the back, `null` to hide |
| `photo` | `null` | Image URL, drawn in grayscale on the front |
| `logo` | `null` | Light logo on transparent background (SVG/PNG), front and back |
| `logoMark` | `null` | Pictogram for the back and the lanyard |
| `lanyardText` | full name, uppercase | Text repeated on the lanyard |
| `iridescence` | `true` | Holographic sheen on the card |
| `colors` | dark indigo palette | `card`, `cardBack`, `accent`, `accent2`, `accentText`, `text`, `textMuted`, `line`, `lanyard`, `lanyardText`, `lanyardSheen`, `hardware` – each merged individually |
| `modelUrl` | bundled GLB | Custom model (see below) |

Images are drawn on a canvas, so they must be same-origin or served with CORS headers.

## Development

```bash
npm install
npm run dev              # playground on http://localhost:5173
npm run build            # dist/lib (npm) + dist/standalone (script tag)
npm run build:demo       # dist/demo (GitHub Pages)
npm run lint
```

`examples/vanilla/` (copy `dist/standalone/` into `examples/vanilla/vendor/`, then
`python3 -m http.server` in that folder) and `examples/react/` (`npm install && npm run dev`) show both
integrations. Append `?closeup` to the dev URL to zoom on the clip.

## 3D model (Blender)

`blender/make_badge.py` builds the model from code and writes `src/assets/badge.glb` (used by the site) and
`blender/badge.blend` (for manual edits):

```bash
blender --background --python blender/make_badge.py
```

To edit by hand, open `blender/badge.blend`. Change shapes freely, but **do not rename** the objects
`card`, `clip`, `clamp`, `strap_anchor` or the materials `front`, `back`, `edge`, `metal`: the code looks
them up by name. `strap_anchor` is an empty at the center of the D-ring bar, where the lanyard wraps; move it
with the ring. The card collider is computed from the bounds of `card`.
Export with *File → Export → glTF 2.0*: **glTF Binary (.glb)**, *+Y Up* on, *Apply Modifiers* on, over
`src/assets/badge.glb` (or serve it elsewhere and pass `modelUrl`). Re-running the script overwrites
`badge.blend`.

## License

[MIT](LICENSE) © Maxsteal91. The bundled Geist fonts are under the
[SIL Open Font License](src/assets/fonts/OFL-Geist.txt).
