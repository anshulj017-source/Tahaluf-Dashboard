fetch('http://localhost:3002/api/tiktok/creatives?advertiser_id=7598486787190997008')
  .then(res => res.json())
  .then(json => {
    if(json.data && json.data.length > 0) {
      console.log('First mapped ad:', JSON.stringify(json.data[0], null, 2));
    }
  });
