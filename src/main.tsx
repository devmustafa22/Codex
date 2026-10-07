import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './styles.css';
import { AppProvider } from './state/AppContext';
import { AuthProvider } from './state/AuthContext';
import { AuthGate } from './components/AuthGate';

const App = lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <Suspense
            fallback={
              <main className="workspace-loading" role="status">
                نجهّز مساحتك…
              </main>
            }
          >
            <App />
          </Suspense>
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
