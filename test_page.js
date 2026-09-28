const fs = require('fs');
const d3 = require('d3');
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3002/api/sheets?type=afc';
const CHANNELS = [
  { name: 'TikTok', gid: '0', viewsCol: 9, compCol: 11 },
  { name: 'Snapchat', gid: '1220368554', viewsCol: 8, compCol: 10 },
  { name: 'Meta', gid: '796244792', viewsCol: 9, compCol: 11 },
  { name: 'DV360', gid: '357397097', viewsCol: 9, compCol: 10, subCol: 11 },
  { name: 'X', gid: '1750570025', viewsCol: 9, compCol: 11 },
  { name: 'Google', gid: '1637892512', viewsCol: 6, compCol: 7, subCol: 12 },
  { name: 'Amazon', gid: '770767992', viewsCol: 10, compCol: 10, subCol: 11 }
];

async function run() {
  const fetchPromises = CHANNELS.map(ch => 
    fetch(`${BASE_URL}&gid=${ch.gid}`).then(res => res.text()).then(text => {
      const raw = d3.csvParse(text);
      return raw.map(row => {
        const campDB = row['Campaign DB'] || row['Campaign name'] || row['Campaign Name'] || 'Unknown';
        return {
          campaignName: campDB,
        };
      });
    })
  );

  const results = await Promise.all(fetchPromises);
  const combinedAds = results.flat();
  
  const campaigns = Array.from(new Set(combinedAds.map(d => d.campaignName))).sort();
  console.log('All unique campaigns in adData:', campaigns);
}
run();
