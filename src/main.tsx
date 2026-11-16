import ReactDOM from 'react-dom/client';
import { RootApp } from './app/RootApp';
import './product.css';

// Punto de entrada único: el visor 3D y YOLO se cargan solo al navegar a Monitoreo.
ReactDOM.createRoot(document.getElementById('root')!).render(<RootApp />);
