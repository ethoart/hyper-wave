const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');
if (!code.includes('Brain')) {
    code = code.replace(/\} from 'lucide-react';/, ", Brain } from 'lucide-react';");
    fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
}
