const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Rename the button
code = code.replace(
  `onClick={() => setRightSidebarTab('market')}
                     className={\`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1 \${rightSidebarTab === 'market' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}\`}
                   >
                     Order Book`,
  `onClick={() => setRightSidebarTab('history')}
                     className={\`flex-1 py-3 text-[10px] sm:text-xs uppercase font-bold tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1 \${rightSidebarTab === 'history' ? 'border-[#2962ff] text-white' : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'}\`}
                   >
                     History`
);

// 2. Remove the Order Book (market tab) rendering code.
// The history rendering block is from `) : rightSidebarTab === 'history' ? (` to the first `) : rightSidebarTab === 'market' ? (`
// Note that `rightSidebarTab === 'market'` block is at the bottom. We can just delete it.
// We will locate `) : rightSidebarTab === 'market' ? (` and then remove it to the end of the `) : null}` block if possible.

// We can just use split and join since it's the last else if before ` : null}`
code = code.replace(/\) : rightSidebarTab === 'market' \? \([\s\S]*?\) : null\}/, ") : null}");

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
