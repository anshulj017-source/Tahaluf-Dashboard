const accessToken = "038848799faf466b917103057a4f341d945a0a64";
const advertiserId = "7598486787190997008";

const videoInfoUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/tt_video/info/');
videoInfoUrl.searchParams.append('advertiser_id', advertiserId);
videoInfoUrl.searchParams.append('item_ids', JSON.stringify(["7638002364749712661"]));

fetch(videoInfoUrl.toString(), {
  headers: { 'Access-Token': accessToken }
})
.then(res => res.json())
.then(json => {
  console.log(JSON.stringify(json, null, 2));
});
