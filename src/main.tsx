import '@fontsource-variable/archivo/wdth.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) void import('./store').then((s) => ((window as unknown as { kulstu: unknown }).kulstu = s))

// Chỉ khi phát triển: /#demo hoặc /#demo-heal mở sẵn ảnh mẫu đã chỉnh để soát giao diện.
if (import.meta.env.DEV && location.hash.startsWith('#demo')) {
  void import('./store').then(async (s) => {
    await new Promise((r) => setTimeout(r, 300))
    s.openSample()
    s.change((r) => ({
      ...r,
      adj: { ...r.adj, b: 24, c: 12, s: 0, t: 18 },
      preset: { id: 'dao', amt: 80 },
      smooth: 60,
      white: 40,
      shape: { ...r.shape, eyes: 40, nose: 40, mouth: 0 },
      spots: [{ x: 0.56, y: 0.52, r: 0.012 }],
    }))
    const tab = location.hash.slice(6)
    if (tab) s.setTab(tab as never)
    if (location.hash.includes('split')) s.setSplit(true)
  })
}
