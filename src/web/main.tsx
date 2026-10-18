import '@fontsource-variable/inter';
import './styles.css';
import './lib/pwa.ts';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import Sign from './sign/Sign.tsx';

// The admin area is a separate chunk, so the sign stays light on the Raspberry Pi.
const Admin = lazy(() => import('./admin/AdminApp.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Sign />} />
        <Route path="/carousel" element={<Sign layout="carousel" />} />
        <Route path="/big" element={<Sign layout="big" />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
