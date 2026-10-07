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
import { LanguageProvider, useLanguage } from './state/LanguageContext';

const App = lazy(() => import('./App'));

function PreparingWorkspace() {
  const { t } = useLanguage();
  return (
    <main className="workspace-loading" role="status">
      {t('common.preparingWorkspace')}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <AuthGate>
          <AppProvider>
            <Suspense fallback={<PreparingWorkspace />}>
              <App />
            </Suspense>
          </AppProvider>
        </AuthGate>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
);
