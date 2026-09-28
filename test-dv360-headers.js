const d3 = require('d3-dsv');
fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vRZN6bAVfKFdo97WjexoYjk8oi9Or-uxeSpeTreivX3wmgUp5TKx1u_hr53nuBE0zVnQy9TPVHd4pwC/pub?output=csv&gid=357397097')
  .then(res => res.text())
  .then(text => {
    const parsed = d3.csvParse(text);
    if(parsed.length > 0) {
      console.log('DV360 headers:', Object.keys(parsed[0]).map((h, i) => `${i}: ${h}`));
    }
  });
