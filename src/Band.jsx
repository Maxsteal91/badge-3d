import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { BallCollider, CuboidCollider, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import badgeUrl from './assets/badge.glb?url'
import { createCardTextures } from './cardTexture'
import { createLanyardTextures, TILE_RATIO } from './lanyardTexture'
import { RibbonGeometry } from './Ribbon'

useGLTF.preload(badgeUrl)

const STRAP = { width: 0.24, thickness: 0.012, samples: 64 }
// piega del nastro attorno alla barra della D: coda cucita dietro, giro sotto la barra, risalita davanti
const FOLD = { height: 0.12, tail: 0.1, radius: 0.021, gap: STRAP.thickness / 2 + 0.001, samples: 24 }

// misure lette dal GLB, così restano giuste anche dopo modifiche manuali in Blender:
// collider = ingombro del nodo "card", barra della D = posizione dell'empty "strap_anchor"
function measure(scene) {
  const card = new THREE.Box3().setFromObject(scene.getObjectByName('card'))
  const bar = scene.getObjectByName('strap_anchor').getWorldPosition(new THREE.Vector3()).y
  return { halfW: (card.max.x - card.min.x) / 2, halfH: (card.max.y - card.min.y) / 2, bar, anchor: bar + FOLD.height }
}

// percorso della piega nel sistema della tessera (y in alto, z verso la camera), dalla coda all'aggancio
function foldPath(bar) {
  const { height, tail, radius: r, gap, samples } = FOLD
  const third = Math.round(samples / 3)
  const ease = (k) => k * k * (3 - 2 * k)
  const pts = []
  for (let i = 0; i < third; i++) {                     // coda dietro: scende allargandosi fino alla barra
    const k = i / third
    pts.push(new THREE.Vector3(0, bar + tail * (1 - k), -(gap + (r - gap) * ease(k))))
  }
  const arc = samples - third * 2
  for (let i = 0; i < arc; i++) {                       // giro sotto la barra
    const a = (Math.PI * i) / (arc - 1)
    pts.push(new THREE.Vector3(0, bar - r * Math.sin(a), -r * Math.cos(a)))
  }
  for (let i = 1; i <= third; i++) {                    // risalita davanti, si stringe verso la cucitura
    const k = i / third
    pts.push(new THREE.Vector3(0, bar + height * k, gap + (r - gap) * (1 - ease(k))))
  }
  return pts
}
const SEGMENT = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 2 }
const LEAN_MAX = 0.3         // rad: rotazione massima verso il mouse quando ci passa sopra
const INTRO_SPIN = 11        // rad/s alla prima caduta (0 per disattivare)
const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)

// metà larghezza visibile (in unità di scena) sul piano z = 0
function halfViewWidth(camera) {
  return camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
}

// anchor: frazione (0..1) della larghezza del canvas da cui pende il laccio
// config: già risolta con resolveConfig (vedi defaults.js)
export function Band({ config, grabRef, anchor = 0.5, eventsEl = null, maxSpeed = 50, minSpeed = 10 }) {
  const band = useRef(), fixed = useRef(), j1 = useRef(), j2 = useRef(), j3 = useRef(), card = useRef()
  const pointerIn = useRef(false)
  const lean = useRef(0)
  const yaw = useRef(0)
  const spun = useRef(false)
  const tmp = useMemo(() => ({
    vec: new THREE.Vector3(), dir: new THREE.Vector3(), ang: new THREE.Vector3(),
    q: new THREE.Quaternion(), anchor: new THREE.Vector3(), front: new THREE.Vector3(),
    side: new THREE.Vector3(), yawS: new THREE.Vector3(),
    points: Array.from({ length: FOLD.samples + STRAP.samples - 1 }, () => new THREE.Vector3()),
    sides: Array.from({ length: FOLD.samples + STRAP.samples - 1 }, () => new THREE.Vector3()),
  }), [])
  const { scene } = useGLTF(config.modelUrl || badgeUrl)
  const CARD = useMemo(() => measure(scene), [scene])
  const fold = useMemo(() => foldPath(CARD.bar), [CARD])
  const [curve] = useState(() => {
    const c = new THREE.CatmullRomCurve3(Array.from({ length: 4 }, () => new THREE.Vector3()))
    c.curveType = 'centripetal'   // niente anse o picchi quando due segmenti si avvicinano
    return c
  })
  const [dragged, drag] = useState(false)
  const [hovered, hover] = useState(false)

  const strap = useMemo(() => {
    const { map, normalMap } = createLanyardTextures(config)
    // tessuto: ruvido, con il riflesso radente (sheen) tipico del poliestere
    const cloth = {
      normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.95, envMapIntensity: 0.4,
      sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color(config.colors.lanyardSheen),
    }
    const fabric = new THREE.MeshPhysicalMaterial({ ...cloth, map })
    const geometry = new RibbonGeometry(FOLD.samples + STRAP.samples - 1)
    return { geometry, fabric, disposables: [map, normalMap, fabric, geometry] }
  }, [config])

  const model = useMemo(() => {
    const textures = createCardTextures(config)
    // plastica: clearcoat lucido, metalness 0.5 e iridescenza
    const plastic = {
      clearcoat: 1, clearcoatRoughness: 0.15, roughness: 0.3, metalness: 0.5,
      ...(config.iridescence && { iridescence: 1, iridescenceIOR: 1, iridescenceThicknessMinimum: 0, iridescenceThicknessMaximum: 2400 }),
    }
    const metal = new THREE.MeshStandardMaterial({ color: config.colors.hardware, metalness: 1, roughness: 0.3 })
    const mats = {
      front: new THREE.MeshPhysicalMaterial({ map: textures.front, ...plastic }),
      back: new THREE.MeshPhysicalMaterial({ map: textures.back, ...plastic }),
      edge: new THREE.MeshPhysicalMaterial({ color: config.colors.card, ...plastic }),
      metal,
    }
    const root = scene.clone(true)
    root.traverse((o) => {
      if (o.isMesh) o.material = mats[o.material.name] ?? metal
    })
    return { root, disposables: [textures.front, textures.back, ...Object.values(mats)] }
  }, [scene, config])

  // al cambio di config (o all'unmount) libera texture e materiali della versione precedente
  useEffect(() => () => strap.disposables.forEach((d) => d.dispose()), [strap])
  useEffect(() => () => model.disposables.forEach((d) => d.dispose()), [model])

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, CARD.anchor, 0]])

  // il mouse sul canvas (non solo sulla tessera) fa ruotare appena la tessera verso di sé
  const canvas = useThree((state) => state.gl.domElement)
  const camera = useThree((state) => state.camera)
  // posizione iniziale del punto fisso (le RigidBody leggono la posizione solo alla creazione)
  const [startX] = useState(() => (anchor * 2 - 1) * halfViewWidth(camera))
  useEffect(() => {
    const target = eventsEl ?? canvas
    const enter = () => void (pointerIn.current = true)
    const leave = () => void (pointerIn.current = false)
    // anche pointermove: se il mouse è già sul canvas al caricamento, pointerenter non arriva
    target.addEventListener('pointermove', enter)
    target.addEventListener('pointerleave', leave)
    return () => {
      target.removeEventListener('pointermove', enter)
      target.removeEventListener('pointerleave', leave)
    }
  }, [canvas, eventsEl])

  useEffect(() => {
    if (!hovered) return
    document.body.style.cursor = dragged ? 'grabbing' : 'grab'
    return () => void (document.body.style.cursor = 'auto')
  }, [hovered, dragged])

  useFrame((state, delta) => {
    const { vec, dir, ang, q, anchor, front, side, yawS, points, sides } = tmp
    if (dragged) {
      // proietta il puntatore sul piano z=0 della scena
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z })
    }
    if (!fixed.current) return
    // il punto fisso segue la colonna del layout (resize della finestra, cambio di larghezza)
    const fx = (anchor * 2 - 1) * halfViewWidth(state.camera)
    const f = fixed.current.translation()
    if (Math.abs(f.x - fx) > 1e-3) {
      fixed.current.setTranslation({ x: fx, y: f.y, z: f.z }, true)
      ;[card, j1, j2, j3].forEach((ref) => ref.current?.wakeUp())
    }
    // prima caduta: una spinta sull'asse verticale fa girare la tessera e mostra il retro,
    // poi il richiamo verso il fronte (in fondo a questo frame) la riporta dritta
    if (!spun.current) {
      spun.current = true
      card.current.setAngvel({ x: 0, y: INTRO_SPIN, z: 0 }, true)
    }
    // lerp dei segmenti intermedi: niente jitter a bassi fps
    ;[j1, j2].forEach((ref) => {
      if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation())
      const d = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())))
      // fattore limitato a 1: con un frame lungo (scheda in background) il lerp andrebbe oltre il bersaglio e divergerebbe
      ref.current.lerped.lerp(ref.current.translation(), Math.min(1, delta * (minSpeed + d * (maxSpeed - minSpeed))))
    })

    // un unico nastro: piega attorno alla D (solidale alla tessera) + tratto che pende (fisica)
    const r = card.current.rotation()
    const c = card.current.translation()
    q.set(r.x, r.y, r.z, r.w)
    front.copy(Z).applyQuaternion(q)
    side.copy(X).applyQuaternion(q)
    for (let i = 0; i < FOLD.samples; i++) {
      points[i].copy(fold[i]).applyQuaternion(q).add(c)
      sides[i].copy(side)
    }
    anchor.copy(points[FOLD.samples - 1])
    curve.points[0].copy(anchor)
    curve.points[1].copy(j2.current.lerped)
    curve.points[2].copy(j1.current.lerped)
    curve.points[3].copy(fixed.current.translation())
    // punti coincidenti mandano in NaN la parametrizzazione centripetal: li distanzio di poco
    for (let i = 1; i < 4; i++)
      if (curve.points[i].distanceToSquared(curve.points[i - 1]) < 1e-6) curve.points[i].y += 1e-3
    curve.needsUpdate = true     // le lunghezze d'arco sono in cache: vanno ricalcolate a ogni frame
    const pts = curve.getSpacedPoints(STRAP.samples - 1)
    if (!pts.every((p) => Number.isFinite(p.x + p.y + p.z))) return

    // torsione: in basso il nastro segue la rotazione della tessera, in alto torna dritto.
    // l'angolo viene "srotolato" frame per frame, così più giri si accumulano come in un laccio vero
    let a = Math.atan2(front.x, front.z)
    while (a - yaw.current > Math.PI) a -= Math.PI * 2
    while (a - yaw.current < -Math.PI) a += Math.PI * 2
    yaw.current = a
    for (let i = 1; i < STRAP.samples; i++) {           // pts[0] coincide con la fine della piega
      const t = i / (STRAP.samples - 1)
      const ay = a * (1 - t) * (1 - t)
      yawS.set(Math.cos(ay), 0, -Math.sin(ay))
      const k = FOLD.samples - 1 + i
      points[k].copy(pts[i])
      sides[k].copy(side).lerp(yawS, Math.min(1, i / 4)).normalize()
    }
    strap.geometry.update(points, sides, { width: STRAP.width, thickness: STRAP.thickness, tile: STRAP.width * TILE_RATIO })

    // con il mouse sopra, la tessera si gira appena verso di lui (solo attorno alla verticale)
    let target = 0
    if (pointerIn.current && !dragged) {
      vec.copy(c).project(state.camera)
      target = THREE.MathUtils.clamp((state.pointer.x - vec.x) * 0.6, -1, 1) * LEAN_MAX
    }
    lean.current += (target - lean.current) * Math.min(1, delta * 4)

    // richiama la tessera verso il fronte (o verso il mouse), così non continua a girare su se stessa.
    // L'errore è l'angolo vero attorno alla verticale (non la componente y del quaternione, che cambia segno)
    const yawErr = Math.atan2(front.x, front.z) - lean.current
    ang.copy(card.current.angvel())
    card.current.setAngvel({ x: ang.x, y: ang.y - yawErr * 0.12, z: ang.z }, Math.abs(yawErr) > 0.01)
  })

  const onPointerDown = (e) => {
    e.stopPropagation()
    // niente selezione del testo sotto la tessera (gli eventi di R3F sono passive: preventDefault non serve)
    document.body.style.userSelect = 'none'
    e.target.setPointerCapture(e.pointerId)
    grabRef.current = true
    drag(new THREE.Vector3().copy(e.point).sub(tmp.vec.copy(card.current.translation())))
  }
  const onPointerUp = (e) => {
    e.target.releasePointerCapture(e.pointerId)
    grabRef.current = false
    document.body.style.userSelect = ''
    grabRef.lastUp = performance.now()   // Badge blocca il click che segue il rilascio
    drag(false)
  }

  return (
    <>
      <group position={[startX, 4, 0]}>
        <RigidBody ref={fixed} {...SEGMENT} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...SEGMENT}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...SEGMENT}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...SEGMENT}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[2, 0, 0]} ref={card} {...SEGMENT} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[CARD.halfW, CARD.halfH, 0.01]} />
          <primitive
            object={model.root}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        </RigidBody>
      </group>
      <mesh ref={band} geometry={strap.geometry} material={strap.fabric} frustumCulled={false} />
    </>
  )
}
