const fs = require('fs');
const d3 = require('d3');
const fetch = require('node-fetch');

async function test() {
  const chRes = await fetch("http://localhost:3002/api/sheets?type=afc&gid=796244792");
  const raw = d3.csvParse(await chRes.text());
  const mapped = raw.map(row => {
    return {
      campaignName: row['Campaign DB'] || row['Campaign name'] || row['Campaign Name'] || 'Unknown'
    };
  });
  console.log("Unique Meta campaigns:", Array.from(new Set(mapped.map(d => d.campaignName))));
}
test();
