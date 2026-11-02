import * as THREE from 'three'
import { loadFonts, loadImage } from './cardTexture'

// Texture del laccio in tessuto. Asse x del canvas = lunghezza del nastro (u), asse y = larghezza (v).
// Una piastrella copre TILE_RATIO volte la larghezza del nastro.
export const TILE_RATIO = 12
const TW = 3072, TH = TW / TILE_RATIO
const THREAD = 8              // px per filo: ~32 fili sulla larghezza del nastro

// rumore deterministico, così la trama è identica a ogni caricamento
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

// value noise a bassa frequenza, periodico lungo x (la piastrella si ripete senza cuciture)
function valueNoise(rand, cellsX, cellsY) {
  const g = Array.from({ length: (cellsX + 1) * (cellsY + 1) }, () => rand())
  for (let j = 0; j <= cellsY; j++) g[j * (cellsX + 1) + cellsX] = g[j * (cellsX + 1)]
  return (x, y) => {
    const fx = (x / TW) * cellsX, fy = (y / TH) * cellsY
    const i = Math.floor(fx), j = Math.min(cellsY - 1, Math.floor(fy))
    const tx = fx - i, ty = fy - j
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const at = (a, b) => g[b * (cellsX + 1) + a]
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * sx
    const bot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx
    return top + (bot - top) * sy
  }
}

// Tela (plain weave): ordito lungo il nastro e trama di traverso che passano a turno sopra e sotto.
// Ogni filo ha sezione tonda, tra i fili restano piccoli solchi; ai bordi la cimosa a coste fitte.
function buildFabric() {
  const rand = rng(7)
  const mottle = valueNoise(rand, 48, 3)       // macchie leggere di colore, visibili anche da lontano
  const slub = valueNoise(rand, 160, 32)       // fili un po' più grossi o più sottili
  const h = new Float32Array(TW * TH), tone = new Float32Array(TW * TH)
  for (let y = 0; y < TH; y++) {
    const v = y / TH, edge = Math.min(v, 1 - v)
    const iy = Math.floor(y / THREAD), fy = (y % THREAD) / THREAD
    for (let x = 0; x < TW; x++) {
      const ix = Math.floor(x / THREAD), fx = (x % THREAD) / THREAD
      const warp = Math.sin(Math.PI * fy), weft = Math.sin(Math.PI * fx)
      let height
      if (edge < 0.05) {
        height = 0.35 + 0.5 * warp * (0.6 + 0.4 * Math.sqrt(edge / 0.05))       // cimosa: solo ordito, bordo che scende
      } else if ((ix + iy) % 2 === 0) {
        height = 0.45 + 0.55 * warp * Math.pow(weft, 0.35)                       // ordito sopra
      } else {
        height = 0.45 + 0.55 * weft * Math.pow(warp, 0.35)                       // trama sopra
      }
      const i = y * TW + x
      height *= 0.85 + 0.3 * slub(x, y)
      h[i] = Math.min(1, height + (rand() - 0.5) * 0.12)                           // peluria
      tone[i] = mottle(x, y)
    }
  }
  return { h, tone }
}

function normalCanvas(h, strength) {
  const canvas = Object.assign(document.createElement('canvas'), { width: TW, height: TH })
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(TW, TH)
  for (let y = 0; y < TH; y++) {
    const yu = Math.max(0, y - 1), yd = Math.min(TH - 1, y + 1)
    for (let x = 0; x < TW; x++) {
      const xl = (x - 1 + TW) % TW, xr = (x + 1) % TW
      const dx = (h[y * TW + xr] - h[y * TW + xl]) * strength
      const dy = (h[yd * TW + x] - h[yu * TW + x]) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * TW + x) * 4
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function drawColor(canvas, cfg, { h, tone }, mark) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })   // ogni ridisegno rilegge i pixel
  ctx.fillStyle = cfg.colors.lanyard
  ctx.fillRect(0, 0, TW, TH)

  // stampa (serigrafia): pittogramma + testo lungo il nastro, ripetuti a distanza ravvicinata
  ctx.fillStyle = cfg.colors.lanyardText
  ctx.font = `700 ${Math.round(TH * 0.36)}px BadgeGeist, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const ms = mark ? TH * 0.5 : 0, gap = mark ? TH * 0.2 : 0
  const block = ms + gap + ctx.measureText(cfg.lanyardText ?? '').width
  const n = Math.max(1, Math.floor(TW / (block + TH * 0.9)))
  const step = TW / n
  for (let k = 0; k < n; k++) {
    const x = step * (k + 0.5) - block / 2
    if (mark) {
      // il nastro è letto dal basso verso l'alto: ruoto il pittogramma come il testo
      ctx.save()
      ctx.translate(x + ms / 2, TH / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(mark, -ms / 2, -ms / 2, ms, ms)
      ctx.restore()
    }
    ctx.fillText(cfg.lanyardText, x + ms + gap, TH / 2 + TH * 0.02)
    // separatore a puntini tra una ripetizione e l'altra
    ctx.globalAlpha = 0.55
    for (let d = -2; d <= 2; d++) {
      ctx.beginPath()
      ctx.arc(step * (k + 1) + d * TH * 0.09, TH / 2, TH * 0.018, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // la trama modula colore e inchiostro: i fili in rilievo prendono luce, nei solchi la stampa si spezza
  const img = ctx.getImageData(0, 0, TW, TH)
  const d = img.data
  for (let i = 0; i < TW * TH; i++) {
    const k = 0.62 + h[i] * 0.5 + (tone[i] - 0.5) * 0.16
    d[i * 4] = Math.min(255, d[i * 4] * k + 3 * h[i])
    d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k + 3 * h[i])
    d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k + 3 * h[i])
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function texture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 16
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

// la trama non dipende dalla config: calcolata una volta sola e riusata a ogni cambio di colori/testo
let fabricCache, normalCache
export function createLanyardTextures(cfg) {
  const fabric = (fabricCache ??= buildFabric())
  const canvas = Object.assign(document.createElement('canvas'), { width: TW, height: TH })
  const map = texture(drawColor(canvas, cfg, fabric, null), true)
  // ridisegna quando il pittogramma e il font Geist (caricato da cardTexture) sono pronti
  Promise.all([loadImage(cfg.logoMark), loadFonts()]).then(([mark]) => {
    drawColor(canvas, cfg, fabric, mark)
    map.needsUpdate = true
  })
  return { map, normalMap: texture((normalCache ??= normalCanvas(fabric.h, 3)), false) }
}
