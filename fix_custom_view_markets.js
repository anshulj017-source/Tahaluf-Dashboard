const fs = require('fs');
let code = fs.readFileSync('app/CustomView.jsx', 'utf8');

// 1. Update Props
code = code.replace(
  /const CustomView = \({ adData, exRate, exSym, formatShort, filterCampaigns, dateRange, userRole }\) => {/,
  "const CustomView = ({ adData, exRate, exSym, formatShort, filterCampaigns, filterMarkets, dateRange, userRole }) => {"
);

// 2. Add refs & hasMarketFilter
code = code.replace(
  /const chartsRef = useRef\(null\);/,
  "const chartsRef = useRef(null);\n  const marketChartsRef = useRef(null);\n  const hasMarketFilter = filterMarkets && filterMarkets.length > 0 && !filterMarkets.includes('All');"
);

// 3. Update tableDataByWeek
code = code.replace(
  /const mappedData = filteredData\.map\(d => \(\{\n          week: d\.week,\n          campaignName: hasCampFilter \? d\.campaignName : 'All Campaigns',\n          channel: hasChanFilter \? d\.channel : 'All Channels',/,
  "const mappedData = filteredData.map(d => ({\n          week: d.week,\n          market: hasMarketFilter ? d.country : 'All Markets',\n          campaignName: hasCampFilter ? d.campaignName : 'All Campaigns',\n          channel: hasChanFilter ? d.channel : 'All Channels',"
);

code = code.replace(
  /const groups = d3\.groups\(mappedData, d => d\.week, d => d\.campaignName, d => d\.channel\);/,
  "const groups = d3.groups(mappedData, d => d.week, d => d.market, d => d.campaignName, d => d.channel);"
);

code = code.replace(
  /groups\.forEach\(\(\[week, camps\]\) => \{\n          camps\.forEach\(\(\[camp, chans\]\) => \{\n              chans\.forEach\(\(\[chan, items\]\) => \{/,
  "groups.forEach(([week, markets]) => {\n          markets.forEach(([market, camps]) => {\n            camps.forEach(([camp, chans]) => {\n              chans.forEach(([chan, items]) => {"
);

code = code.replace(
  /rows\.push\(\{\n                      week,\n                      campaignName: camp,\n                      channel: chan,\n                      cost,\n                      impressions,\n                      clicks,\n                      videoViews,\n                      videoViews6s,\n                      videoViews15s,\n                      videoCompletions\n                  \}\);\n              \}\);\n          \}\);\n      \}\);/,
  "rows.push({\n                      week,\n                      market,\n                      campaignName: camp,\n                      channel: chan,\n                      cost,\n                      impressions,\n                      clicks,\n                      videoViews,\n                      videoViews6s,\n                      videoViews15s,\n                      videoCompletions\n                  });\n              });\n            });\n          });\n      });"
);

// 4. Update PPT Generation
code = code.replace(
  /await addSnapshotSlide\(chartsRef, "Performance & Channel Mix"\);/,
  "await addSnapshotSlide(chartsRef, \"Performance & Channel Mix\");\n          if (hasMarketFilter) {\n              await addSnapshotSlide(marketChartsRef, \"Market Performance & Mix\");\n          }"
);

// 5. Add marketTrendData and marketMixData calculation
code = code.replace(
  /const channelMix = useMemo\(\(\) => \{/,
  `const marketTrendData = useMemo(() => {
      if (!hasMarketFilter) return [];
      const grouped = d3.rollups(filteredData, 
         v => ({ Spend: d3.sum(v, i => i.cost), Impressions: d3.sum(v, i => i.impressions) }), 
         d => d.date, 
         d => d.country
      );
      return grouped.map(([date, marketsMap]) => {
         const obj = { date: date };
         for (const [mkt, metrics] of marketsMap) {
            obj[\`\${mkt} Spend\`] = metrics.Spend;
            obj[\`\${mkt} Impressions\`] = metrics.Impressions;
         }
         return obj;
      }).sort((a,b) => new Date(a.date) - new Date(b.date));
  }, [filteredData, hasMarketFilter]);

  const marketMixData = useMemo(() => {
      if (!hasMarketFilter) return [];
      const grouped = d3.rollups(filteredData, v => d3.sum(v, i => i.cost), d => d.country);
      return grouped.map(([market, spend]) => ({ name: market, value: spend })).sort((a,b) => b.value - a.value);
  }, [filteredData, hasMarketFilter]);

  const channelMix = useMemo(() => {`
);

// 6. Table Headers - Add Market column
code = code.replace(
  /<th className="py-4 px-4 text-\[\#c88214\] font-black text-xs">WEEK<\/th>\n                       <th className="py-4 px-4 text-\[\#c88214\] font-black text-xs">CAMPAIGN<\/th>/,
  '<th className="py-4 px-4 text-[#c88214] font-black text-xs">WEEK</th>\n                       <th className="py-4 px-4 text-[#c88214] font-black text-xs">MARKET</th>\n                       <th className="py-4 px-4 text-[#c88214] font-black text-xs">CAMPAIGN</th>'
);

// 7. Table Rows - Add Market column
code = code.replace(
  /<td className="py-4 px-4 text-white text-sm font-bold">\{d\.week\}<\/td>\n                       <td className="py-4 px-4 text-white text-sm">\{d\.campaignName\}<\/td>/,
  '<td className="py-4 px-4 text-white text-sm font-bold">{d.week}</td>\n                       <td className="py-4 px-4 text-[#c88214] text-sm font-bold">{d.market}</td>\n                       <td className="py-4 px-4 text-white text-sm">{d.campaignName}</td>'
);

// 8. Add Market Charts JSX
const chartsJsx = `
           {/* MARKET CHARTS */}
           {hasMarketFilter && (
             <div ref={marketChartsRef} className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 mt-8">
                <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 xl:col-span-2 shadow-xl">
                   <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                     <TrendingUp className="text-[#c88214] w-5 h-5" /> Market Performance Trend
                   </h3>
                   <div className="h-72">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={marketTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                         <XAxis dataKey="date" stroke="#6fa89f" fontSize={12} tickLine={false} axisLine={false} />
                         {userRole !== 'non-finance' && <YAxis yAxisId="left" stroke="#74FA93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />}
                         <YAxis yAxisId={userRole === 'non-finance' ? "left" : "right"} orientation={userRole === 'non-finance' ? "left" : "right"} stroke="#c88214" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                         <RechartsTooltip contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                         <Legend wrapperStyle={{ paddingTop: '20px' }} />
                         
                         {filterMarkets.map((mkt, idx) => {
                             if (mkt === 'All') return null;
                             const color1 = COLORS[idx % COLORS.length];
                             const color2 = COLORS[(idx + 2) % COLORS.length];
                             return (
                               <React.Fragment key={mkt}>
                                 {userRole !== 'non-finance' && <Line yAxisId="left" type="monotone" name={\`\${mkt} Spend\`} dataKey={\`\${mkt} Spend\`} stroke={color1} strokeWidth={3} dot={false} />}
                                 <Line yAxisId={userRole === 'non-finance' ? "left" : "right"} type="monotone" name={\`\${mkt} Impressions\`} dataKey={\`\${mkt} Impressions\`} stroke={color2} strokeWidth={3} strokeDasharray="5 5" dot={false} />
                               </React.Fragment>
                             );
                         })}
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                </div>

                <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl">
                   <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                     <Activity className="text-[#c88214] w-5 h-5" /> Market Mix
                   </h3>
                   <div className="h-72">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie data={marketMixData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                           {marketMixData.map((entry, index) => (
                             <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', fontSize: '12px' }}
                            formatter={(val) => \`\${exSym}\${d3.format(",.2f")(val)}\`}
                         />
                         <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                </div>
             </div>
           )}
`;

code = code.replace(
  /<\/div>\n\n           <div ref=\{tableRef\} className="card-surface backdrop-blur-2xl\/80 backdrop-blur-xl/,
  "</div>\n" + chartsJsx + "\n           <div ref={tableRef} className=\"card-surface backdrop-blur-2xl/80 backdrop-blur-xl"
);

fs.writeFileSync('app/CustomView.jsx', code);
console.log('Script executed');
