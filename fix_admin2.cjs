const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(/\{user\?\.role === 'admin' \|\| user\?\.role === 'super_admin' && \(/g, "{(user?.role === 'admin' || user?.role === 'super_admin') && (");
code = code.replace(/user\?\.role === 'admin' \|\| user\?\.role === 'super_admin' \|\| user\?\.role === 'super_admin'/g, "user?.role === 'admin' || user?.role === 'super_admin'");

fs.writeFileSync('src/components/Dashboard.tsx', code);
