import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled CJK face — self-hosted, unicode-range-subsetted, so only the glyph
// ranges actually used are fetched (stays local-first; no external requests).
import '@fontsource-variable/noto-sans-sc/index.css';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
