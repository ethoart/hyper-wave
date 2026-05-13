const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/enum: \['admin', 'pro', 'user'\]/g, "enum: ['super_admin', 'admin', 'pro', 'user']");
code = code.replace(/req\.user(?:\?)?\.role !== 'admin'/g, "req.user?.role !== 'admin' && req.user?.role !== 'super_admin'");
code = code.replace(/req\.user\.role !== 'admin' && req\.user\.role !== 'pro'/g, "req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'pro'");
code = code.replace(/req\.user\.role !== 'pro' && req\.user\.role !== 'admin'/g, "req.user.role !== 'pro' && req.user.role !== 'admin' && req.user.role !== 'super_admin'");
code = code.replace(/role: \{ \$in: \['pro', 'admin'\] \}/g, "role: { $in: ['pro', 'admin', 'super_admin'] }");

fs.writeFileSync('server.ts', code);
