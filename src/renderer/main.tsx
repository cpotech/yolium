import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from '@renderer/theme';
import { VimModeProvider } from '@renderer/context/VimModeContext';
import '../index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <VimModeProvider>
          <App />
        </VimModeProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
