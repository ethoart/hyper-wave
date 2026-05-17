const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const target = `                       </div>
                    )}
                    
                    {rightSidebarTab === 'history' && (
                       <div className="flex-1 overflow-y-auto no-scrollbar p-3 relative">`;

const replacement = `                       </div>
                    ) : rightSidebarTab === 'history' ? (
                       <div className="flex-1 overflow-y-auto no-scrollbar p-3 relative">`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
