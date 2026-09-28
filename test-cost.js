const d3 = require('d3-dsv');
fetch('https://loc-dashboard-psi.vercel.app/api/sheets?type=afc&gid=1220368554')
  .then(res => res.text())
  .then(text => {
    const parsed = d3.csvParse(text);
    let totalCost = 0;
    parsed.forEach(row => {
      if (row['Phase DB'] === 'Gulf Cup' || row['Campaign DB'] === 'Gulf Cup') {
        const costStr = row['Cost (USD)'] || row['Cost'] || '0';
        totalCost += parseFloat(costStr.replace(/[^0-9.-]+/g,""));
      }
    });
    // convert to SAR
    console.log("Total Snapchat Cost in USD:", totalCost);
    console.log("Total Snapchat Cost in SAR:", totalCost * 3.75);
  });
