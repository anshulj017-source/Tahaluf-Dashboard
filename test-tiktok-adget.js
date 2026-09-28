const accessToken = "038848799faf466b917103057a4f341d945a0a64";
const advertiserId = "7598486787190997008";

const adGetUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/ad/get/');
adGetUrl.searchParams.append('advertiser_id', advertiserId);
adGetUrl.searchParams.append('filtering', JSON.stringify({ ad_ids: ["1864788938518994"] }));
adGetUrl.searchParams.append('page_size', '100');

fetch(adGetUrl.toString(), {
  headers: { 'Access-Token': accessToken }
})
.then(res => res.json())
.then(json => {
  console.log(JSON.stringify(json, null, 2));
});
