const fs = require('fs');
const d3 = require('d3');
const fetch = require('node-fetch'); // node 18+ has global fetch

async function test() {
  const metaUrl = `http://localhost:3002/api/sheets?type=afc&gid=796244792`;
  const res = await fetch(metaUrl);
  const text = await res.text();
  const raw = d3.csvParse(text);
  
  const campaigns = Array.from(new Set(raw.map(row => row['Campaign DB'] || row['Campaign name'] || row['Campaign Name'] || 'Unknown')));
  console.log(campaigns);
}
test();
