import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Router from './routes'
import AuthProvider from './_utils/auth/authProvider';
import DateProvider from './_utils/date';
import WSProvider from './_utils/websocket/websoket';

export default function App() {
  return (
    <AuthProvider>
      <DateProvider>
        <WSProvider>
          <Router />
        </WSProvider>
      </DateProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
