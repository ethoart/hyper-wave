const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(/user\.role !== 'admin' && user\.role !== 'pro'/g, "user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'pro'");
code = code.replace(/user\?\.role === 'admin' \|\| user\?\.role === 'pro'/g, "(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'pro')");
code = code.replace(/user\?\.role === 'pro' \|\| user\?\.role === 'admin'/g, "(user?.role === 'pro' || user?.role === 'admin' || user?.role === 'super_admin')");
code = code.replace(/user\?\.role === 'admin'\s+\?/g, "user?.role === 'admin' || user?.role === 'super_admin' ?");
code = code.replace(/u\.role === 'admin'\s+\?/g, "u.role === 'admin' || u.role === 'super_admin' ?");
code = code.replace(/user\?\.role === 'admin'/g, "user?.role === 'admin' || user?.role === 'super_admin'");

fs.writeFileSync('src/components/Dashboard.tsx', code);
