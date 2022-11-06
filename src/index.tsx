import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { configure } from 'mobx';

import App from './App';

import 'antd/dist/antd.min.css';

import './index.scss';

configure({
	enforceActions: 'never',
});

ReactDOM.render(
	<BrowserRouter>
		<App />
	</BrowserRouter>,
	document.getElementById('root') as HTMLElement,
);
