import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './game/controller';
import './style.css';
import { App } from './ui/App';
import { setState } from './ui/store';

const applyUpdate = registerSW({
  // Never reload under a running match: the menu offers the update instead.
  onNeedRefresh: () => setState({ updateReady: true }),
});

render(<App onUpdate={() => void applyUpdate(true)} />, document.getElementById('ui')!);
void boot(document.getElementById('stage')!);
