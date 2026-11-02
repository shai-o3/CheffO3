import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';

const DEMO = import.meta.env.VITE_DEMO === '1';

async function start() {
  if (DEMO) {
    const { installMockApi } = await import('./demo/mockApi.js');
    installMockApi();
    document.documentElement.classList.add('demo');
    // The embedded demo can't show native dialogs; treat confirmations as accepted.
    window.confirm = () => true;
  }
  const Router = DEMO ? MemoryRouter : BrowserRouter;
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Router>
        <App />
      </Router>
    </StrictMode>,
  );
  if (!DEMO && 'serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

start();
