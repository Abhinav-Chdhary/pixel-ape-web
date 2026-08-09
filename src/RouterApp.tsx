import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { WorkspaceApp } from './App'
import { GalleryPage, HomePage, PublicSpritePage } from './public/PublicPages'

export function RouterApp() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/workspace" element={<WorkspaceApp />} />
    <Route path="/gallery" element={<GalleryPage />} />
    <Route path="/s/:slug" element={<PublicSpritePage />} />
    <Route path="*" element={<HomePage />} />
  </Routes></BrowserRouter>
}
