const fs = require('fs');
const path = require('path');

// 1. Ensure public directory exists
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

// 2. Generate db.js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let dbJsContent = '';
if (supabaseUrl && supabaseKey) {
    dbJsContent = `// db.js - Auto-generated
const SUPABASE_URL = '${supabaseUrl}';
const SUPABASE_KEY = '${supabaseKey}';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized.');
} else {
    console.error('Supabase SDK not loaded');
}
`;
} else {
    console.warn("WARNING: Supabase credentials not found in env vars. Generating placeholder db.js");
    dbJsContent = `// db.js - Placeholder
console.error('Supabase credentials missing in build environment.');
let supabaseClient = null;
`;
}

fs.writeFileSync(path.join('public', 'db.js'), dbJsContent);
console.log('Generated public/db.js');

// 3. Copy Static Files
const filesToCopy = ['index.html', 'style.css', 'app.js'];
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join('public', file));
        console.log(`Copied ${file} to public/`);
    } else {
        console.error(`Error: Could not find ${file}`);
    }
});

console.log("Build complete.");
