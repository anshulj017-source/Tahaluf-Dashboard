const fs = require('fs');
const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:3002/api/sheets?type=afc&gid=796244792');
    const txt = await res.text();
    console.log("Fetched Meta:", txt.substring(0, 100));
  } catch (err) {
    console.error(err);
  }
}
test();
