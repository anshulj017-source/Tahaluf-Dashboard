const fs = require('fs');
const d3 = require('d3');
const fetch = require('node-fetch');

async function test() {
  const metaUrl = `http://localhost:3002/api/sheets?type=afc&gid=796244792`;
  const res = await fetch(metaUrl);
  const text = await res.text();
  const raw = d3.csvParse(text);
  
  const gulfRows = raw.filter(row => (row['Campaign DB'] || row['Campaign name'] || '') === 'Gulf Cup');
  console.log('Gulf Cup rows:', gulfRows.length);
  if (gulfRows.length > 0) {
    console.log('Dates:', Array.from(new Set(gulfRows.map(r => r.Date))));
  }
}
test();
