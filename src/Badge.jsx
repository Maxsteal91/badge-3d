import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, events as createPointerEvents } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Band } from './Band'

// solo in sviluppo: ?closeup avvicina la camera al moschettone per controllare i dettagli
const CLOSEUP = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('closeup')
const CAMERA = CLOSEUP ? { position: [0, 2.2, 4.5], fov: 25 } : { position: [0, 0, 11.5], fov: 25 }

// Con eventSource gli eventi arrivano da un altro elemento: il puntatore va calcolato rispetto al
// canvas (getBoundingClientRect), non rispetto all'elemento colpito né all'angolo della finestra
function canvasRelativeEvents(store) {
  return {
    ...createPointerEvents(store),
    compute(event, state) {
      const r = state.gl.domElement.getBoundingClientRect()
      state.pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1)
      state.raycaster.setFromCamera(state.pointer, state.camera)
    },
  }
}

// Posizione orizzontale del punto da cui pende il laccio, in frazione della larghezza del canvas
function anchorFraction(wrap, anchor) {
  if (!wrap || !anchor) return 0.5
  const w = wrap.getBoundingClientRect(), a = anchor.getBoundingClientRect()
  return w.width ? (a.left + a.width / 2 - w.left) / w.width : 0.5
}

/**
 * config: config già risolta (resolveConfig)
 * host: elemento in cui è montato il badge (stesse dimensioni del canvas)
 * anchorEl: elemento sotto il cui centro pende il badge (default: centro del canvas)
 * eventsEl: elemento che riceve gli eventi del mouse al posto del canvas. In quel caso il canvas
 *           può coprire testo e link (pointer-events: none) senza bloccarli, e il badge ha tutto lo
 *           spazio per dondolare.
 */
export function Badge({ config, host = null, anchorEl = null, eventsEl = null }) {
  const wrap = useRef()
  const grabRef = useRef(false)
  const [visible, setVisible] = useState(true)
  // misurata subito (host ha le stesse dimensioni del canvas) così la prima caduta parte già dal punto giusto
  const [anchor, setAnchor] = useState(() => anchorFraction(host, anchorEl))

  useEffect(() => {
    if (!anchorEl) return
    const update = () => setAnchor(anchorFraction(wrap.current, anchorEl))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap.current)
    ro.observe(anchorEl)
    return () => ro.disconnect()
  }, [anchorEl])

  // un click che segue una presa sulla tessera non deve attivare link o pulsanti sotto di lei
  useEffect(() => {
    if (!eventsEl) return
    const guard = (e) => {
      if (performance.now() - (grabRef.lastUp ?? -1e9) < 300) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    eventsEl.addEventListener('click', guard, true)
    return () => eventsEl.removeEventListener('click', guard, true)
  }, [eventsEl])

  // render solo quando il contenitore è visibile (fisica inclusa: segue il frameloop)
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' })
    io.observe(wrap.current)
    return () => io.disconnect()
  }, [])

  // touch: blocca lo scroll della pagina solo mentre si tiene la tessera
  useEffect(() => {
    const el = eventsEl ?? wrap.current
    const block = (e) => { if (grabRef.current) e.preventDefault() }
    el.addEventListener('touchstart', block, { passive: false })
    el.addEventListener('touchmove', block, { passive: false })
    return () => {
      el.removeEventListener('touchstart', block)
      el.removeEventListener('touchmove', block)
    }
  }, [eventsEl])

  return (
    <div ref={wrap} style={{ width: '100%', height: '100%' }}>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        camera={CAMERA}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent', pointerEvents: eventsEl ? 'none' : 'auto' }}
        eventSource={eventsEl ?? undefined}
        events={eventsEl ? canvasRelativeEvents : undefined}
      >
        <ambientLight intensity={Math.PI} />
        <Suspense fallback={null}>
          <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
            <Band config={config} grabRef={grabRef} anchor={anchor} eventsEl={eventsEl} />
          </Physics>
        </Suspense>
        <Environment blur={0.75}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  )
}
