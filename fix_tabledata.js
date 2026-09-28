const fs = require('fs');
let content = fs.readFileSync('app/CampaignView.jsx', 'utf8');

const oldCalc = `      const views = d3.sum(rows, d => d.videoViews);
      const spend = d3.sum(rows, d => d.cost);
      
      return {
        channel,
        spend,
        impressions,
        clicks,
        views,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpv: views > 0 ? spend / views : 0
      };`;

const newCalc = `      const views = d3.sum(rows, d => d.videoViews);
      const views6s = d3.sum(rows, d => d.videoViews6s || 0);
      const views15s = d3.sum(rows, d => d.videoViews15s || 0);
      const completions = d3.sum(rows, d => d.videoCompletions || 0);
      const spend = d3.sum(rows, d => d.cost);
      
      return {
        channel,
        spend,
        impressions,
        clicks,
        views,
        views6s,
        views15s,
        completions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpv: views > 0 ? spend / views : 0,
        cpcv: completions > 0 ? spend / completions : 0
      };`;

content = content.replace(oldCalc, newCalc);
fs.writeFileSync('app/CampaignView.jsx', content);
console.log("Updated tableData generation");
