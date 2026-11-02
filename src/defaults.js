// Configurazione di default del badge. Ogni campo può essere sovrascritto a runtime:
// Badge3D.mount(el, { firstName: 'Ada', colors: { accent: '#ff0066' } })  oppure  <Badge3D config={...} />

export const defaultConfig = {
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'Software Engineer',
  company: 'Acme Inc.',      // mostrato al posto del logo quando `logo` è null
  tag: 'CONF 2026',          // testo monospace in alto a destra (data, città, evento…)

  contacts: [
    { label: 'Email', value: 'jane@example.com' },
    { label: 'GitHub', value: 'github.com/janedoe' },
    { label: 'Website', value: 'janedoe.dev' },
  ],

  // indirizzo stampato sul retro della tessera (`null` per non mostrarlo)
  mainLink: 'https://example.com',

  // contenuto del QR code sul fronte (`null` per non mostrarlo)
  qr: 'https://example.com',

  // URL di immagini (stesso dominio o con CORS abilitato). `null` = non disegnate.
  photo: null,
  logo: null,       // logo chiaro su trasparente (SVG/PNG): fronte e retro
  logoMark: null,   // pittogramma: centro del retro e laccio

  colors: {
    card: '#0b0c1f',       // fronte
    cardBack: '#0b0c1f',   // retro
    accent: '#4B50C9',
    accent2: '#07A1AB',
    accentText: '#a4a7ff', // ruolo
    text: '#ffffff',
    textMuted: '#9a9cb8',
    line: '#2b2e63',
    lanyard: '#191b45',
    lanyardText: '#eef0ff',
    lanyardSheen: '#8a8fd6',
    hardware: '#1c1c1e',   // moschettone e anello ('#d6d8dc' per l'acciaio cromato)
  },

  // riflesso olografico della tessera
  iridescence: true,

  // testo ripetuto sul laccio (default: nome e cognome in maiuscolo)
  lanyardText: null,

  // modello 3D alternativo (GLB con gli stessi nomi di oggetti/materiali di quello incluso)
  modelUrl: null,
}

// Unisce la config dell'utente ai default: `colors` campo per campo, gli altri campi (array inclusi) sostituiti.
export function resolveConfig(user = {}) {
  const cfg = { ...defaultConfig, ...user, colors: { ...defaultConfig.colors, ...user.colors } }
  cfg.contacts = Array.isArray(cfg.contacts) ? cfg.contacts : []
  cfg.tag ??= ''
  cfg.firstName ??= ''
  cfg.lastName ??= ''
  cfg.role ??= ''
  cfg.company ??= ''
  cfg.lanyardText ||= `${cfg.firstName} ${cfg.lastName}`.trim().toUpperCase()
  return cfg
}
