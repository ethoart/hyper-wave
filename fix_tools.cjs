const fs = require('fs');
let code = fs.readFileSync('src/components/WaveChart.tsx', 'utf8');

const drawingToolsTarget = "const drawingTools = ['pen', 'trend', 'fibonacci', 'parallel', 'rectangle', 'measure'];";
const drawingToolsRepl = "const drawingTools = ['pen', 'trend', 'parallel', 'rectangle'];";
code = code.replace(drawingToolsTarget, drawingToolsRepl);

fs.writeFileSync('src/components/WaveChart.tsx', code, 'utf8');
