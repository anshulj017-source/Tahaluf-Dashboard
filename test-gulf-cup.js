const d3 = require('d3-dsv');
fetch('https://loc-dashboard-psi.vercel.app/api/sheets?type=afc&gid=1220368554')
  .then(res => res.text())
  .then(text => {
    const parsed = d3.csvParse(text);
    const gulfCupRows = parsed.filter(row => row['Phase DB'] === 'Gulf Cup' || row['Campaign DB'] === 'Gulf Cup');
    console.log(`Found ${gulfCupRows.length} Gulf Cup rows`);
    if(gulfCupRows.length > 0) {
      console.log('Sample row Buying Type DB:', gulfCupRows[0]['Buying Type DB']);
      console.log('Sample row entire object keys:', Object.keys(gulfCupRows[0]));
    }
  });
