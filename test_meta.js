const fs = require('fs');
require('dotenv').config({ path: '.env' });
const fetch = require('node-fetch');
const d3 = require('d3');

async function test() {
  const metaUrl = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRZN6bAVfKFdo97WjexoYjk8oi9Or-uxeSpeTreivX3wmgUp5TKx1u_hr53nuBE0zVnQy9TPVHd4pwC/pub?output=csv&gid=796244792`;
  const res = await fetch(metaUrl);
  const text = await res.text();
  const raw = d3.csvParse(text);
  
  const campaigns = Array.from(new Set(raw.map(r => r['Campaign DB'] || r['Campaign name'] || r['Campaign Name'] || 'Unknown')));
  console.log(campaigns);
}
test();
