import { BotProvider, useBot } from './context/BotContext';
import { LocaleProvider } from './i18n/LocaleContext';
import { LoginGateView } from './views/LoginGateView';
import { BotSelectView } from './views/BotSelectView';
import { ModernDashboard } from './components/ModernDashboard';
function AppRoot(){const {profiles,isSelectingBot}=useBot();if(!profiles.length)return <LoginGateView/>;if(isSelectingBot)return <BotSelectView/>;return <ModernDashboard/>;}
export function App(){return <LocaleProvider><BotProvider><AppRoot/></BotProvider></LocaleProvider>}
export default App;
