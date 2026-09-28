const fetch = require('node-fetch');
const token = '038848799faf466b917103057a4f341d945a0a64';
const advertiserId = '7598486787190997008';

const end = new Date();
const start = new Date();
start.setDate(end.getDate() - 30);
const startDate = start.toISOString().split('T')[0]; 
const endDate = end.toISOString().split('T')[0];

const reportUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
reportUrl.searchParams.append('advertiser_id', advertiserId);
reportUrl.searchParams.append('report_type', 'BASIC');
reportUrl.searchParams.append('data_level', 'AUCTION_AD');
reportUrl.searchParams.append('dimensions', JSON.stringify(['ad_id', 'stat_time_day'])); 
const metrics = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'app_install', 'purchase', 'video_play_actions'];
reportUrl.searchParams.append('metrics', JSON.stringify(metrics));
reportUrl.searchParams.append('start_date', startDate);
reportUrl.searchParams.append('end_date', endDate);
reportUrl.searchParams.append('page_size', '10');

fetch(reportUrl.toString(), {
  headers: { 'Access-Token': token, 'Content-Type': 'application/json' }
}).then(r => r.json()).then(j => console.log(j)).catch(e => console.error(e));
