#!/usr/bin/env node
/**
 * Netlify build script
 * Injects SB_URL and SB_KEY env vars into _env.js at build time.
 * 
 * Set these in: Netlify → Site config → Environment variables
 *   SB_URL  = https://xxxx.supabase.co
 *   SB_KEY  = your-anon-key
 */
const fs = require('fs');
const path = require('path');

const url = process.env.SB_URL || '';
const key = process.env.SB_KEY || '';

if (!url || !key) {
    console.warn('⚠️  SB_URL or SB_KEY not set — _env.js will have empty values.');
}

const content = `/* Auto-generated at build time by build-env.js — DO NOT EDIT MANUALLY */
window.SB_CONFIG = {
    url: ${JSON.stringify(url)},
    key: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, '_env.js'), content);
console.log(`✓ _env.js written (url: ${url ? 'set' : 'MISSING'}, key: ${key ? 'set' : 'MISSING'})`);
