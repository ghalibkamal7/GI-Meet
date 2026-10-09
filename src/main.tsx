import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { initPwa } from './pwa/pwa';

// Registers the web service worker + install/update listeners. A no-op inside
// the native Capacitor apps and in `vite dev`.
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);