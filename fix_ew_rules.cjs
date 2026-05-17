const fs = require('fs');
let code = fs.readFileSync('ewEngine.ts', 'utf8');

const bullRuleTarget = `      if (w2 <= start) score -= 50; // Wave 2 shouldn't go below start
      if (w4 <= w1) score -= 30; // Overlap rule often broken in crypto by wicks
      if (w3 <= w1) score -= 20; // Wave 3 usually the longest`;

const bullRuleRepl = `      if (w2 <= start) continue; // W2 must not go below start
      if (w4 <= w1 * 0.99) continue; // W4 shouldn't overlap W1 too much
      if (w3 <= w1) continue; // W3 must be higher than W1 for impulse`;

code = code.replace(bullRuleTarget, bullRuleRepl);


const bearRuleTarget = `      if (w2 >= start) score -= 50;
      if (w4 >= w1) score -= 30;
      if (w3 >= w1) score -= 20;`;

const bearRuleRepl = `      if (w2 >= start) continue; // W2 must not go above start
      if (w4 >= w1 * 1.01) continue; // W4 shouldn't overlap W1 too much
      if (w3 >= w1) continue; // W3 must be lower than W1 for impulse`;

code = code.replace(bearRuleTarget, bearRuleRepl);

fs.writeFileSync('ewEngine.ts', code, 'utf8');
