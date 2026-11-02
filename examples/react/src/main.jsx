import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Badge3D } from 'badge-3d'

function App() {
  const [role, setRole] = useState('Frontend Engineer')
  return (
    <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <section style={{ padding: 32 }}>
        <h1>Hello from React</h1>
        <input value={role} onChange={(e) => setRole(e.target.value)} />
      </section>
      <Badge3D
        style={{ height: '100vh' }}
        config={{ firstName: 'Linus', lastName: 'Example', role, colors: { accent: '#10b981' } }}
      />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
