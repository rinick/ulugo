import ReactDOM from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import 'antd/dist/reset.css';
import '@ulugo/go-board/css/board.css';
import './styles/fonts.css';
import './styles/global.css';
import './features/localization/i18n';
import {App} from './app/App';

if (['http:', 'https:'].includes(window.location.protocol) && window.ulugo?.platform !== 'electron') {
  registerSW({immediate: true});
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
