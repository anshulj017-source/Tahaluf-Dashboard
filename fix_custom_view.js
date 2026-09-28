const fs = require('fs');
let content = fs.readFileSync('app/CustomView.jsx', 'utf8');

const tableDataOld = `  // Table Aggregation by Week
  const tableDataByWeek = useMemo(() => {
      const hasCampFilter = filterCampaigns.length > 0 && !filterCampaigns.includes('All');
      const hasChanFilter = fChannels.length > 0;
      
      const mappedData = filteredData.map(d => ({
          week: d.week,
          campaignName: hasCampFilter ? d.campaignName : 'All Campaigns',
          channel: hasChanFilter ? d.channel : 'All Channels',
          cost: d.cost,
          impressions: d.impressions,
          clicks: d.clicks
      }));

      const groups = d3.groups(mappedData, d => d.week, d => d.campaignName, d => d.channel);
      const rows = [];
      groups.forEach(([week, camps]) => {
          camps.forEach(([camp, chans]) => {
              chans.forEach(([chan, items]) => {
                  rows.push({
                      week,
                      campaignName: camp,
                      channel: chan,
                      cost: d3.sum(items, i => i.cost),
                      impressions: d3.sum(items, i => i.impressions),
                      clicks: d3.sum(items, i => i.clicks),
                  });
              });
          });
      });
      // Sort week numerically, then campaign
      return rows.sort((a,b) => {
         const wa = parseInt(a.week.replace('Week ','')) || 0;
         const wb = parseInt(b.week.replace('Week ','')) || 0;
         if (wa !== wb) return wa - wb;
         return a.campaignName.localeCompare(b.campaignName);
      });
  }, [filteredData, filterCampaigns, fChannels]);`;

const tableDataNew = `  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'cost', label: 'Spend', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")((v||0)) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")((v||0)) },
      { key: 'videoViews', label: 'Video Views', format: v => formatShort(v||0) },
      { key: 'videoViews6s', label: '6s Views', format: v => formatShort(v||0) },
      { key: 'videoViews15s', label: '15s Views', format: v => formatShort(v||0) },
      { key: 'videoCompletions', label: 'Completed Views', format: v => formatShort(v||0) },
      { key: 'cpc', label: 'CPC', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'cpm', label: 'CPM', format: v => \`\${exSym}\${d3.format(",.2f")((v||0) * exRate)}\` },
      { key: 'ctr', label: 'CTR', format: v => \`\${(v||0).toFixed(2)}%\` },
      { key: 'cpv', label: 'CPV', format: v => \`\${exSym}\${d3.format(",.4f")((v||0) * exRate)}\` },
      { key: 'cpcv', label: 'CPCV', format: v => \`\${exSym}\${d3.format(",.4f")((v||0) * exRate)}\` }
    ];
    if (userRole === 'non-finance') {
      return base.filter(m => !['cost', 'cpc', 'cpm', 'cpv', 'cpcv'].includes(m.key));
    }
    return base;
  }, [exRate, exSym, userRole]);

  const [selectedMetrics, setSelectedMetrics] = useState(
    userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'videoViews'] : ['cost', 'impressions', 'clicks']
  );

  // Table Aggregation by Week
  const tableDataByWeek = useMemo(() => {
      const hasCampFilter = filterCampaigns.length > 0 && !filterCampaigns.includes('All');
      const hasChanFilter = fChannels.length > 0;
      
      const mappedData = filteredData.map(d => ({
          week: d.week,
          campaignName: hasCampFilter ? d.campaignName : 'All Campaigns',
          channel: hasChanFilter ? d.channel : 'All Channels',
          cost: d.cost || 0,
          impressions: d.impressions || 0,
          clicks: d.clicks || 0,
          videoViews: d.videoViews || 0,
          videoViews6s: d.videoViews6s || 0,
          videoViews15s: d.videoViews15s || 0,
          videoCompletions: d.videoCompletions || 0
      }));

      const groups = d3.groups(mappedData, d => d.week, d => d.campaignName, d => d.channel);
      const rows = [];
      groups.forEach(([week, camps]) => {
          camps.forEach(([camp, chans]) => {
              chans.forEach(([chan, items]) => {
                  const impressions = d3.sum(items, i => i.impressions);
                  const clicks = d3.sum(items, i => i.clicks);
                  const cost = d3.sum(items, i => i.cost);
                  const videoViews = d3.sum(items, i => i.videoViews);
                  const videoCompletions = d3.sum(items, i => i.videoCompletions);
                  rows.push({
                      week,
                      campaignName: camp,
                      channel: chan,
                      cost,
                      impressions,
                      clicks,
                      videoViews,
                      videoViews6s: d3.sum(items, i => i.videoViews6s),
                      videoViews15s: d3.sum(items, i => i.videoViews15s),
                      videoCompletions,
                      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                      cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
                      cpc: clicks > 0 ? cost / clicks : 0,
                      cpv: videoViews > 0 ? cost / videoViews : 0,
                      cpcv: videoCompletions > 0 ? cost / videoCompletions : 0
                  });
              });
          });
      });
      // Sort week numerically, then campaign
      return rows.sort((a,b) => {
         const wa = parseInt(a.week.replace('Week ','')) || 0;
         const wb = parseInt(b.week.replace('Week ','')) || 0;
         if (wa !== wb) return wa - wb;
         return a.campaignName.localeCompare(b.campaignName);
      });
  }, [filteredData, filterCampaigns, fChannels]);`;

content = content.replace(tableDataOld, tableDataNew);

const renderOld = `           <div ref={tableRef} className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl overflow-x-auto custom-scrollbar">
              <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2 uppercase tracking-widest text-sm">
                 <TableProperties className="text-[#c88214] w-5 h-5" /> Data Breakdown
              </h3>
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-[#c88214]/20">
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Week</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Campaign</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Channel</th>
                       {userRole !== 'non-finance' && <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest text-right">Spend</th>}
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest text-right">Impressions</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest text-right">Clicks</th>
                    </tr>
                 </thead>
                 <tbody>
                    {tableDataByWeek.slice(0, 50).map((d, i) => (
                       <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4 text-white text-sm font-medium">{d.week}</td>
                          <td className="py-4 px-4 text-white text-sm font-bold">{d.campaignName}</td>
                          <td className="py-4 px-4 text-[#c88214] text-sm font-bold">{d.channel}</td>
                          {userRole !== 'non-finance' && <td className="py-4 px-4 text-white text-sm font-bold text-right">{exSym}{d3.format(",.2f")(d.cost * exRate)}</td>}
                          <td className="py-4 px-4 text-white text-sm font-bold text-right">{d3.format(",.0f")(d.impressions)}</td>
                          <td className="py-4 px-4 text-white text-sm font-bold text-right">{d3.format(",.0f")(d.clicks)}</td>
                       </tr>
                    ))}
                 </tbody>
              </table>`;

const renderNew = `           <div ref={tableRef} className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl overflow-x-auto custom-scrollbar">
              <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                 <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-widest text-sm">
                    <TableProperties className="text-[#c88214] w-5 h-5" /> Data Breakdown
                 </h3>
                 <MultiSelectDropdown 
                   label=""
                   options={AVAILABLE_METRICS.map(m => m.key)} 
                   selected={selectedMetrics} 
                   onChange={setSelectedMetrics} 
                 />
              </div>
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-[#c88214]/20">
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Week</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Campaign</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Channel</th>
                       {selectedMetrics.map((metricKey) => {
                          const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                          if (!mDef) return null;
                          return (
                            <th key={metricKey} className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest text-right">
                              {mDef.label}
                            </th>
                          )
                       })}
                    </tr>
                 </thead>
                 <tbody>
                    {tableDataByWeek.slice(0, 50).map((d, i) => (
                       <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4 text-white text-sm font-medium">{d.week}</td>
                          <td className="py-4 px-4 text-white text-sm font-bold">{d.campaignName}</td>
                          <td className="py-4 px-4 text-[#c88214] text-sm font-bold">{d.channel}</td>
                          {selectedMetrics.map((metricKey) => {
                             const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                             if (!mDef) return null;
                             return (
                               <td key={metricKey} className="py-4 px-4 text-white text-sm font-bold text-right">
                                 {mDef.format(d[metricKey])}
                               </td>
                             )
                          })}
                       </tr>
                    ))}
                 </tbody>
              </table>`;

content = content.replace(renderOld, renderNew);
fs.writeFileSync('app/CustomView.jsx', content);
console.log("Updated CustomView");
