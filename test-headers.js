const d3 = require('d3-dsv');
fetch('http://localhost:3002/api/sheets?type=afc&gid=756303247')
  .then(res => res.text())
  .then(text => {
    const parsed = d3.csvParse(text);
    if(parsed.length > 0) {
      console.log(Object.keys(parsed[0]));
    }
  });
