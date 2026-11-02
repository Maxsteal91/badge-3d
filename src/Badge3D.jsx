import { useEffect, useMemo, useState } from 'react'
import { Badge } from './Badge'
import { resolveConfig } from './defaults'
import { fallbackImageStyle, hasWebGL, renderFallbackImage } from './fallback'

// accetta un elemento DOM, un ref ({ current }) o un selettore CSS
function resolveElement(target) {
  if (!target) return null
  if (typeof target === 'string') return document.querySelector(target)
  return 'current' in target ? target.current : target
}

function Fallback({ config }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    renderFallbackImage(config).then((url) => alive && setSrc(url))
    return () => void (alive = false)
  }, [config])
  if (!src) return null
  const alt = [`${config.firstName} ${config.lastName}`.trim(), config.role].filter(Boolean).join(' – ')
  return <img src={src} alt={alt} style={fallbackImageStyle} />
}

/**
 * Badge 3D con laccio. Riempie il proprio contenitore: dagli un'altezza (style / className).
 *
 * config:   oggetto parziale, unito ai default (vedi defaults.js)
 * anchor:   elemento / ref / selettore sotto il cui centro pende il laccio (default: centro del badge)
 * events:   elemento / ref / selettore che riceve gli eventi del mouse al posto del canvas, così il
 *           canvas può coprire testo e link senza bloccarli
 */
export function Badge3D({ config, anchor = null, events = null, className, style }) {
  // la config viene confrontata per valore: un oggetto inline non ricrea le texture a ogni render
  const key = JSON.stringify(config ?? {})
  const cfg = useMemo(() => resolveConfig(JSON.parse(key)), [key])
  const [host, setHost] = useState(null)
  const [webgl] = useState(hasWebGL)
  // risolti dopo il primo commit (host impostato): a quel punto i ref del genitore sono già collegati
  const anchorEl = host ? resolveElement(anchor) : null
  const eventsEl = host ? resolveElement(events) : null

  return (
    <div ref={setHost} className={className} style={{ width: '100%', height: '100%', touchAction: 'pan-y', ...style }}>
      {!webgl ? <Fallback config={cfg} />
        : host && <Badge config={cfg} host={host} anchorEl={anchorEl} eventsEl={eventsEl} />}
    </div>
  )
}
