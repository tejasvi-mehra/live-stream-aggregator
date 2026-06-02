
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { assertApiBaseConfigured } from './services/apiBase';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

assertApiBaseConfigured();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
