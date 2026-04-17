const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app', 'admin', '(panel)', 'units', 'page.tsx');
let config = fs.readFileSync(file, 'utf8');

// The main layout styling needs to use system colors instead of hardcoded hex colors to match the theme.
// We'll replace the hardcoded hexes out using regex.

// 1. Theme colors mapping
const replacements = [
    [/bg-\[\#080808\]/g, 'bg-background'],
    [/bg-\[\#0a0a0a\]/g, 'bg-card'],
    [/bg-\[\#0c0c0c\]/g, 'bg-card'],
    [/bg-\[\#0d0d0d\]/g, 'bg-card'],
    [/bg-\[\#0f0f0f\]/g, 'bg-secondary'],
    [/bg-\[\#111\]/g, 'bg-secondary'],
    [/bg-\[\#141414\]/g, 'bg-secondary/80'],
    [/border-\[\#161616\]/g, 'border-border'],
    [/border-\[\#1a1a1a\]/g, 'border-border'],
    [/border-\[\#1e1e1e\]/g, 'border-border'],
    [/border-\[\#222\]/g, 'border-border'],
    [/text-gray-200/g, 'text-foreground'],
    [/text-gray-300/g, 'text-foreground'],
    [/text-gray-400/g, 'text-muted-foreground'],
    [/text-gray-500/g, 'text-muted-foreground'],
    [/text-gray-600/g, 'text-muted-foreground/80'],
    [/text-gray-700/g, 'text-muted-foreground/60'],
];

replacements.forEach(([regex, repl]) => {
    config = config.replace(regex, repl);
});

// 2. Sizing replacements (texts)
const textReplacements = [
    [/text-\[9px\]/g, 'text-xs'],
    [/text-\[10px\]/g, 'text-xs'],
    [/text-\[11px\]/g, 'text-sm'],
    [/\btext-xs\b/g, 'text-sm'],
    [/\btext-sm\b/g, 'text-base'],
];

textReplacements.forEach(([regex, repl]) => {
    config = config.replace(regex, repl);
});

// 3. Sizing replacements (icons)
const iconReplacements = [
    [/\bw-2\.5 h-2\.5\b/g, 'w-4 h-4'],
    [/\bw-3 h-3\b/g, 'w-4 h-4'],
    [/\bw-3\.5 h-3\.5\b/g, 'w-5 h-5'],
    [/\bw-4 h-4\b/g, 'w-5 h-5'],
];

iconReplacements.forEach(([regex, repl]) => {
    config = config.replace(regex, repl);
});

// 4. Improve the log view. 
// Instead of a <pre> inside <details>, let's make it a button that opens a dialog or better format.
// Replace the <details> and <pre> part with a <pre className="whitespace-pre-wrap word-break"> so it can be read without scrolling.
config = config.replace(
    /<pre className="text-sm text-muted-foreground\/80 mt-1 overflow-x-auto max-h-36 bg-black\/40 rounded p-1\.5 border border-border">\{JSON\.stringify\(log\.details, null, 2\)\}<\/pre>/g,
    '<pre className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words bg-secondary/50 rounded-md p-3 border border-border overflow-y-auto max-h-60">{JSON.stringify(log.details, null, 2)}</pre>'
);

// We'll also remove the exact N8N Manager sidebar link at the bottom since they asked to remove workflows.
config = config.replace(
    /\{\/\* Sidebar footer \*\/\}.*?<\/aside>/s,
    '</aside>'
);

fs.writeFileSync(file, config, 'utf8');

console.log('OK. Redesign applied.');
