import { createContext, useContext } from 'react';
import { useOptionalWorkspace } from '@danfessler/trellis-react';
import { useBot } from './BotContext';

export type DashboardPage = 'trading' | 'analysis' | 'history' | 'logs';
export const DashboardNavigation = createContext<((page: DashboardPage) => void) | null>(null);

export function useOpenChart() {
  const navigate = useContext(DashboardNavigation);
  const workspace = useOptionalWorkspace();
  const { setSelectedPair, setMobileTab } = useBot();
  return (pair: string) => {
    setSelectedPair(pair);
    setMobileTab('chart');
    if (workspace) workspace.open('chart', { reuse: 'type', params: { pair } });
    navigate?.('trading');
  };
}
