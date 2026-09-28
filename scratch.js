const d3 = require('d3-dsv');
const fs = require('fs');
const csv = "A,B,Buying Type DB\r\n1,2,CPM\r\n";
const parsed = d3.csvParse(csv);
console.log(Object.keys(parsed[0]));
