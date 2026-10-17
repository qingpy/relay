import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled CJK face — self-hosted, unicode-range-subsetted, so only the glyph
// ranges actually used are fetched (stays local-first; no external requests).
import '@fontsource-variable/noto-sans-sc/index.css';
// Per-style typefaces (index.css `--font-sans` per style), self-hosted and
// unicode-range subsetted: each only downloads while its style is on screen.
import '@fontsource-variable/newsreader/index.css'; // Archival
import '@fontsource-variable/literata/index.css'; // Archival
import '@fontsource-variable/noto-serif-sc/index.css'; // Archival (CJK)
import '@fontsource-variable/plus-jakarta-sans/index.css'; // Monograph
import '@fontsource-variable/source-sans-3/index.css'; // Botanical
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'; // Botanical (CJK)
import 'lxgw-wenkai-webfont/lxgwwenkai-bold.css';
import '@fontsource-variable/ibm-plex-sans/index.css'; // Studio
import '@fontsource/ibm-plex-mono/400.css'; // Studio labels + code
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/ia-writer-quattro/400.css'; // Carbon
import '@fontsource/ia-writer-quattro/400-italic.css';
import '@fontsource/ia-writer-quattro/700.css';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css'; // Polar
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
