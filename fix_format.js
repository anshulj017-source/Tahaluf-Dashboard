const fs = require('fs');
let content = fs.readFileSync('app/CampaignView.jsx', 'utf8');

const oldMetrics = `  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => \`\${exSym}\${d3.format(",.2f")(v * exRate)}\` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")(v) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")(v) },
      { key: 'views', label: 'Video Views', format: v => formatShort(v) },
      { key: 'views6s', label: '6s Views', format: v => formatShort(v) },
      { key: 'views15s', label: '15s Views', format: v => formatShort(v) },
      { key: 'completions', label: 'Completed Views', format: v => formatShort(v) },
      { key: 'cpc', label: 'CPC', format: v => \`\${exSym}\${d3.format(",.2f")(v * exRate)}\` },
      { key: 'cpm', label: 'CPM', format: v => \`\${exSym}\${d3.format(",.2f")(v * exRate)}\` },
      { key: 'ctr', label: 'CTR', format: v => \`\${v.toFixed(2)}%\` },
      { key: 'cpv', label: 'CPV', format: v => \`\${exSym}\${d3.format(",.4f")(v * exRate)}\` },
      { key: 'cpcv', label: 'CPCV', format: v => \`\${exSym}\${d3.format(",.4f")(v * exRate)}\` }
    ];`;

const newMetrics = `  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")((v||0)) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")((v||0)) },
      { key: 'views', label: 'Video Views', format: v => formatShort(v||0) },
      { key: 'views6s', label: '6s Views', format: v => formatShort(v||0) },
      { key: 'views15s', label: '15s Views', format: v => formatShort(v||0) },
      { key: 'completions', label: 'Completed Views', format: v => formatShort(v||0) },
      { key: 'cpc', label: 'CPC', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'cpm', label: 'CPM', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'ctr', label: 'CTR', format: v => \`\${(v||0).toFixed(2)}%\` },
      { key: 'cpv', label: 'CPV', format: v => \`\${exSym}\${d3.format(",.4f")((v||0) * exRate)}\` },
      { key: 'cpcv', label: 'CPCV', format: v => \`\${exSym}\${d3.format(",.4f")((v||0) * exRate)}\` }
    ];`;

content = content.replace(oldMetrics, newMetrics);
fs.writeFileSync('app/CampaignView.jsx', content);
console.log("Updated format functions");
