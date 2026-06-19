import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import '@ulugo/go-board/css/board.css';
import './styles/fonts.css';
import './styles/global.css';
import './features/localization/i18n';
import {App} from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
