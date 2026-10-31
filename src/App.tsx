import { useState, useEffect } from 'react';
import { BotProvider, useBot } from './context/BotContext';
import { LocaleProvider } from './i18n/LocaleContext';
import { LoginGateView } from './views/LoginGateView';
import { BotSelectView } from './views/BotSelectView';
import { MobileWorkspace } from './components/MobileWorkspace';
import { FixedDashboard } from './components/FixedDashboard';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

function AppRoot() {
  const { profiles, isSelectingBot } = useBot();
  const isMobile = useIsMobile();

  // If no bots configured, force user to log in at least one bot
  if (profiles.length === 0) {
    return <LoginGateView />;
  }

  // If user requested bot selection list
  if (isSelectingBot) {
    return <BotSelectView />;
  }

  // Mobile viewport: clean single-view layout with bottom navigation bar
  if (isMobile) {
    return <MobileWorkspace />;
  }

  return <FixedDashboard />;
}

export function App() {
  return (
    <LocaleProvider>
      <BotProvider>
        <AppRoot />
      </BotProvider>
    </LocaleProvider>
  );
}

export default App;
