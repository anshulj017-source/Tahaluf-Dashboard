const d3 = require('d3-dsv');
fetch('https://loc-dashboard-psi.vercel.app/api/sheets?type=afc&gid=756303247')
  .then(res => res.text())
  .then(text => {
    const parsed = d3.csvParse(text);
    if(parsed.length > 0) {
      console.log('Sample row entire object keys:', Object.keys(parsed[0]));
    }
  });
