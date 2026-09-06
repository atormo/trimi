import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LicenseLab } from './LicenseLab';
import './license-lab.css';

createRoot(document.getElementById('root')!).render(<StrictMode><LicenseLab /></StrictMode>);
