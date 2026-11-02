import { createCardTextures } from './cardTexture'

export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}

// senza WebGL: immagine statica del fronte, disegnata con lo stesso codice della texture
export async function renderFallbackImage(cfg) {
  const textures = createCardTextures(cfg)
  await textures.ready
  textures.front.dispose()
  textures.back.dispose()
  return textures.frontCanvas.toDataURL('image/png')
}

export const fallbackImageStyle = {
  display: 'block', maxWidth: '260px', width: '60%', margin: '40px auto',
  borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,.25)',
}
