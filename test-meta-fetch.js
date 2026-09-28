const fs = require('fs');
fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vRZN6bAVfKFdo97WjexoYjk8oi9Or-uxeSpeTreivX3wmgUp5TKx1u_hr53nuBE0zVnQy9TPVHd4pwC/pub?output=csv&gid=756303247')
  .then(res => res.text())
  .then(text => {
    console.log(text.substring(0, 200));
  });
