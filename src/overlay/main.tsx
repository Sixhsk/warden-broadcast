import React from 'react';
import { createRoot } from 'react-dom/client';
import Overlay from './Overlay';
import '../styles/tokens.css';
import './overlay.css';
import '../styles/md3.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
);