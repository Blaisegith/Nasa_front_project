import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles.css';
import './styles/answer.css';
import './styles/modern.css';
import './styles/layout.css';
import './styles/ui.css';
import './styles/dashboard.css';
import './styles/theme-dark.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);