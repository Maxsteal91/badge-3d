import * as THREE from 'three'

// Nastro piatto con spessore che segue una curva. Ogni campione ha 8 vertici
// (fronte, retro e due fianchi, ciascuno con normali proprie) così i bordi restano netti.
export class RibbonGeometry extends THREE.BufferGeometry {
  constructor(samples = 64) {
    super()
    this.samples = samples
    const n = samples * 8
    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
    this.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage))
    // fronte (0,1) | retro (2,3) | fianco destro (4,5) | fianco sinistro (6,7)
    const strips = [[0, 1], [3, 2], [4, 5], [7, 6]]
    const index = []
    for (let i = 0; i < samples - 1; i++) {
      for (const [a, b] of strips) {
        const p = i * 8, q = (i + 1) * 8
        index.push(p + a, p + b, q + a, p + b, q + b, q + a)
      }
    }
    this.setIndex(index)
    this._v = { s: new THREE.Vector3(), n: new THREE.Vector3(), t: new THREE.Vector3(), c: new THREE.Vector3() }
  }

  /**
   * points: array di Vector3 lungo il nastro
   * sides: direzione della larghezza per ogni punto (verrà resa perpendicolare al nastro).
   *        Con la larghezza fissata il nastro può anche girare a U, dove una normale sarebbe ambigua.
   */
  update(points, sides, { width, thickness, tile }) {
    const pos = this.attributes.position.array, nor = this.attributes.normal.array, uv = this.attributes.uv.array
    const { s, n, t } = this._v
    const count = this.samples
    let length = 0
    for (let i = 0; i < count; i++) {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(count - 1, i + 1)]
      t.subVectors(next, prev).normalize()
      s.copy(sides[i]).addScaledVector(t, -sides[i].dot(t)).normalize()   // larghezza
      n.crossVectors(s, t).normalize()                                    // normale del fronte
      if (i > 0) length += points[i].distanceTo(points[i - 1])
      const u = length / tile
      const c = points[i], hw = width / 2, ht = thickness / 2
      const corners = [
        [-hw, ht, n, 1, 1], [hw, ht, n, 1, 0],        // fronte: sinistra, destra (scritta leggibile dal davanti)
        [-hw, -ht, n, -1, 0], [hw, -ht, n, -1, 1],    // retro (leggibile dal dietro)
        [hw, ht, s, 1, 1], [hw, -ht, s, 1, 1],        // fianco destro
        [-hw, ht, s, -1, 0], [-hw, -ht, s, -1, 0],    // fianco sinistro
      ]
      for (let k = 0; k < 8; k++) {
        const [w, h, dirN, sign, v] = corners[k]
        const o = (i * 8 + k) * 3
        pos[o] = c.x + s.x * w + n.x * h
        pos[o + 1] = c.y + s.y * w + n.y * h
        pos[o + 2] = c.z + s.z * w + n.z * h
        nor[o] = dirN.x * sign
        nor[o + 1] = dirN.y * sign
        nor[o + 2] = dirN.z * sign
        uv[(i * 8 + k) * 2] = u
        uv[(i * 8 + k) * 2 + 1] = v
      }
    }
    this.attributes.position.needsUpdate = true
    this.attributes.normal.needsUpdate = true
    this.attributes.uv.needsUpdate = true
    this.computeBoundingSphere()
  }
}
