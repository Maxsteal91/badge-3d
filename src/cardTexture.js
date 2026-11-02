import * as THREE from 'three'
import QRCode from 'qrcode'
import geistBold from './assets/fonts/Geist-Bold.woff2?url'
import geistMedium from './assets/fonts/Geist-Medium.woff2?url'
import geistMono from './assets/fonts/GeistMono-Medium.woff2?url'

// proporzione della tessera nel GLB: 1.6 x 2.55
export const CARD_W = 1024
export const CARD_H = 1632

const SANS = 'BadgeGeist, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const MONO = 'BadgeGeistMono, ui-monospace, "SF Mono", Menlo, monospace'
const PAD = 84

let fontsReady
export function loadFonts() {
  fontsReady ??= Promise.all([
    new FontFace('BadgeGeist', `url(${geistBold})`, { weight: '700' }),
    new FontFace('BadgeGeist', `url(${geistMedium})`, { weight: '500' }),
    new FontFace('BadgeGeistMono', `url(${geistMono})`, { weight: '500' }),
  ].map((f) => f.load().then((ff) => document.fonts.add(ff)).catch(() => null)))
  return fontsReady
}

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// testo che si restringe finché non entra in maxWidth; restituisce la dimensione usata
function fitText(ctx, text, x, y, maxWidth, size, weight, family = SANS, tracking = 0) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px ${family}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * s}px`
    s -= 2
  } while (ctx.measureText(text).width > maxWidth && s > 12)
  ctx.fillText(text, x, y)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  return s + 2
}

// dimensione massima con cui il testo entra in maxWidth, senza disegnarlo
function fitSize(ctx, text, maxWidth, size, weight, family = SANS, tracking = 0) {
  ctx.save()
  let s = size
  for (; s > 12; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * s}px`
    if (ctx.measureText(text).width <= maxWidth) break
  }
  ctx.restore()
  return s
}

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// sfondo: colore pieno con due bagliori morbidi (indigo in alto a destra, teal in basso a sinistra)
function drawBackground(ctx, c, glow) {
  const W = CARD_W, H = CARD_H
  ctx.fillStyle = c.card
  ctx.fillRect(0, 0, W, H)
  for (const [x, y, r, color, a] of glow) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(color, a))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
}

// rete di nodi collegati, decorazione nei colori accent / accent2
function drawNetwork(ctx, c, { x0, y0, x1, y1, count, seed, alpha = 1 }) {
  const rand = rng(seed)
  const nodes = []
  for (let tries = 0; nodes.length < count && tries < count * 40; tries++) {
    const p = { x: x0 + rand() * (x1 - x0), y: y0 + rand() * (y1 - y0), r: 4 + Math.pow(rand(), 2.5) * 16 }
    if (nodes.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 70)) nodes.push(p)
  }
  ctx.lineWidth = 2
  for (const p of nodes) {
    const near = nodes.filter((q) => q !== p).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 2)
    for (const q of near) {
      const g = ctx.createLinearGradient(p.x, p.y, q.x, q.y)
      g.addColorStop(0, rgba(c.accent, 0.5 * alpha))
      g.addColorStop(1, rgba(c.accent2, 0.35 * alpha))
      ctx.strokeStyle = g
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.stroke()
    }
  }
  for (const p of nodes) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    if (p.r > 12) {
      ctx.fillStyle = rgba(c.accent, 0.9 * alpha)
      ctx.fill()
    } else {
      ctx.fillStyle = rgba(c.card, 1)
      ctx.fill()
      ctx.strokeStyle = rgba(p.r > 7 ? c.accent2 : '#ffffff', 0.55 * alpha)
      ctx.stroke()
    }
  }
}

function drawLogo(ctx, cfg, logo, x, y, h, align = 'left') {
  if (logo) {
    const w = (logo.width / logo.height) * h
    ctx.drawImage(logo, align === 'center' ? x - w / 2 : x, y - h, w, h)
    return
  }
  ctx.textAlign = align
  ctx.fillStyle = cfg.colors.text
  fitText(ctx, cfg.company, x, y, 460, h * 1.1, 700, SANS, -0.02)
}

function drawFront(ctx, cfg, { photo, logo, qr }) {
  const c = cfg.colors, W = CARD_W, H = CARD_H
  drawBackground(ctx, c, [[W * 0.95, H * 0.12, W * 0.95, c.accent, 0.55], [W * 0.05, H * 0.95, W * 0.8, c.accent2, 0.22]])
  drawNetwork(ctx, c, { x0: W * 0.52, y0: 330, x1: W - 40, y1: 1060, count: 14, seed: 5, alpha: 0.8 })
  ctx.textBaseline = 'alphabetic'

  // riga superiore: logo a sinistra, tag monospace a destra (il centro resta libero per il foro)
  drawLogo(ctx, cfg, logo, PAD, 250, 78)
  ctx.textAlign = 'right'
  ctx.fillStyle = c.text
  fitText(ctx, String(cfg.tag ?? '').toUpperCase(), W - PAD, 236, 340, 40, 500, MONO, 0.04)

  if (photo) {
    const s = 220, x = W - PAD - s, y = 330
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, s, s, 28)
    ctx.clip()
    ctx.filter = 'grayscale(1) contrast(1.1)'
    const k = Math.max(s / photo.width, s / photo.height)
    ctx.drawImage(photo, (photo.width - s / k) / 2, (photo.height - s / k) / 2, s / k, s / k, x, y, s, s)
    ctx.restore()
  }

  // nome gigante su due righe
  ctx.textAlign = 'left'
  ctx.fillStyle = c.text
  const NAME_Y = 760
  const big = Math.min(
    fitSize(ctx, cfg.firstName, W - PAD * 2, 300, 700, SANS, -0.045),
    fitSize(ctx, cfg.lastName, W - PAD * 2, 300, 700, SANS, -0.045),
  )
  fitText(ctx, cfg.firstName, PAD - 6, NAME_Y, W - PAD * 2, big, 700, SANS, -0.045)
  fitText(ctx, cfg.lastName, PAD - 6, NAME_Y + big * 0.92, W - PAD * 2, big, 700, SANS, -0.045)

  ctx.fillStyle = c.accentText
  fitText(ctx, cfg.role, PAD, NAME_Y + big * 0.92 + 100, W - PAD * 2, 46, 500, SANS, -0.01)

  // contatti in basso
  const top = H - PAD - 330
  ctx.fillStyle = c.line
  ctx.fillRect(PAD, top - 50, W - PAD * 2, 2)
  let y = top
  for (const { label, value } of cfg.contacts) {
    ctx.fillStyle = c.textMuted
    fitText(ctx, label.toUpperCase(), PAD, y, 300, 24, 500, MONO, 0.08)
    ctx.fillStyle = c.text
    fitText(ctx, value, PAD, y + 40, qr ? W - PAD * 2 - 300 : W - PAD * 2, 34, 500, MONO)
    y += 108
  }

  if (qr) {
    const s = 250, x = W - PAD - s, yq = H - PAD - s - 14
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(x - 14, yq - 14, s + 28, s + 28, 22)
    ctx.fill()
    ctx.drawImage(qr, x, yq, s, s)
  }
}

function drawBack(ctx, cfg, { logo, mark }) {
  const c = cfg.colors
  drawBackground(ctx, { ...c, card: c.cardBack }, [[CARD_W / 2, CARD_H * 0.45, CARD_W * 0.8, c.accent, 0.45], [CARD_W * 0.1, CARD_H, CARD_W * 0.7, c.accent2, 0.2]])
  drawNetwork(ctx, { ...c, card: c.cardBack }, { x0: 60, y0: 120, x1: CARD_W - 60, y1: CARD_H - 220, count: 26, seed: 11, alpha: 0.35 })
  ctx.textBaseline = 'alphabetic'
  if (mark) drawLogo(ctx, cfg, mark, CARD_W / 2, CARD_H / 2 + 150, 300, 'center')
  else drawLogo(ctx, cfg, logo, CARD_W / 2, CARD_H / 2 + 40, 110, 'center')
  if (cfg.mainLink) {
    ctx.textAlign = 'center'
    ctx.fillStyle = c.textMuted
    fitText(ctx, cfg.mainLink.replace(/^https?:\/\/(www\.)?/, ''), CARD_W / 2, CARD_H - PAD - 20, CARD_W - PAD * 2, 30, 500, MONO, 0.04)
  }
}

function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.flipY = false            // UV del GLB: v=0 in alto
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}

// Disegna subito con i font di sistema, poi ridisegna quando font, immagini e QR sono pronti.
export function createCardTextures(cfg) {
  const front = Object.assign(document.createElement('canvas'), { width: CARD_W, height: CARD_H })
  const back = Object.assign(document.createElement('canvas'), { width: CARD_W, height: CARD_H })
  const fctx = front.getContext('2d'), bctx = back.getContext('2d')
  drawFront(fctx, cfg, {})
  drawBack(bctx, cfg, {})
  const textures = { front: makeTexture(front), back: makeTexture(back), frontCanvas: front }

  textures.ready = Promise.all([
    loadImage(cfg.photo),
    loadImage(cfg.logo),
    loadImage(cfg.logoMark),
    cfg.qr ? QRCode.toDataURL(cfg.qr, { margin: 0, width: 500, color: { dark: '#0a0a0a', light: '#ffffff' } }).then(loadImage) : null,
    loadFonts(),
  ]).then(([photo, logo, mark, qr]) => {
    drawFront(fctx, cfg, { photo, logo, qr })
    drawBack(bctx, cfg, { logo, mark })
    textures.front.needsUpdate = true
    textures.back.needsUpdate = true
    return textures
  })
  return textures
}
