const fs = require('fs');
let content = fs.readFileSync('app/CampaignView.jsx', 'utf8');

const importsToAdd = `import { ChevronDown, Calendar, Layers, Activity, Check, Search } from 'lucide-react';

const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative w-full max-w-[250px] z-30">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-[#011414] border border-[#c88214]/20 rounded-xl text-xs font-bold text-white cursor-pointer flex justify-between items-center transition-colors hover:border-[#c88214]/50"
      >
        <span className="truncate pr-4">{selected.length} Metrics Selected</span>
        <ChevronDown className={\`w-4 h-4 flex-shrink-0 transition-transform \${isOpen ? 'rotate-180' : ''}\`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchTerm(''); }} />
          <div className="absolute top-full right-0 w-64 mt-2 bg-[#011414]/95 backdrop-blur-2xl border border-[#c88214]/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-80 overflow-hidden z-50">
            <div className="p-3 border-b border-[#c88214]/10 bg-[#011414]">
              <div className="relative">
                <Search className="w-4 h-4 text-[#6fa89f] absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search metrics..." 
                  autoFocus 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  className="w-full bg-[#011414] text-white text-xs font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-[#c88214]/20 focus:border-[#c88214] transition-colors" 
                />
              </div>
            </div>
            <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
              {filteredOptions.map(opt => {
                const isSel = selected.includes(opt.key);
                return (
                  <div 
                    key={opt.key} 
                    onClick={() => {
                      let next = [...selected];
                      if (isSel) {
                        next = next.filter(n => n !== opt.key);
                      } else { 
                        next.push(opt.key); 
                      }
                      onChange(next);
                    }} 
                    className={\`px-3 py-2 mt-1 rounded-lg text-xs font-bold cursor-pointer flex justify-between items-center transition-colors \${isSel ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}\`}
                  >
                    <span className="truncate pr-4">{opt.label}</span> 
                    <Check className={\`w-4 h-4 flex-shrink-0 \${isSel ? 'opacity-100' : 'opacity-0'}\`} />
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};`;

content = content.replace("import { ChevronDown, Calendar, Layers, Activity } from 'lucide-react';", importsToAdd);

const hooksToAdd = `  const [selectedChannels, setSelectedChannels] = useState({}); // { phaseName: [channelNames] }

  const AVAILABLE_METRICS = useMemo(() => {
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
    ];
    if (userRole === 'non-finance') {
      return base.filter(m => !['spend', 'cpc', 'cpm', 'cpv', 'cpcv'].includes(m.key));
    }
    return base;
  }, [exRate, exSym, userRole]);

  const [selectedMetrics, setSelectedMetrics] = useState(
    userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'views'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm']
  );`;

content = content.replace("  const [selectedChannels, setSelectedChannels] = useState({}); // { phaseName: [channelNames] }", hooksToAdd);

// The table replacement logic
const oldTable = `<div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-[#eef7f5] flex items-center gap-3">
              <Activity className="text-[#c88214]" /> Performance Metrics Breakdown
              <InfoTooltip definition="Definition for Performance Metrics Breakdown" />
            </h3>
            <span className="text-xs font-bold text-[#6fa89f] bg-[#011414] px-4 py-2 rounded-lg border border-[#c88214]/10">
              Based on Selection
            </span>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#c88214]/20">
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 rounded-tl-xl">Channel</th>
                  {userRole !== 'non-finance' && <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Spend</th>}
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Impressions</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Clicks</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Video Views</th>
                  <th className={\`py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right \${userRole === 'non-finance' ? 'rounded-tr-xl' : ''}\`}>CTR</th>
                  {userRole !== 'non-finance' && (
                    <>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">CPM</th>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">CPC</th>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">CPV</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={row.channel} className={\`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors \${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/20'}\`}>
                    <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                    {userRole !== 'non-finance' && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.spend * exRate)}</td>}
                    <td className="py-4 px-4 text-sm font-medium text-[#c88214] text-right">{d3.format(",")(row.impressions)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-[#6fa89f] text-right">{d3.format(",")(row.clicks)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-[#c88214] text-right">{formatShort(row.views)}</td>
                    <td className="py-4 px-4 text-sm font-bold text-white text-right">{row.ctr.toFixed(2)}%</td>
                    {userRole !== 'non-finance' && (
                      <>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpm * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpc * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpv * exRate)}</td>
                      </>
                    )}
                  </tr>
                ))}
                {tableData.length > 0 && (() => {
                  const tSpend = d3.sum(tableData, d => d.spend);
                  const tImp = d3.sum(tableData, d => d.impressions);
                  const tClicks = d3.sum(tableData, d => d.clicks);
                  const tViews = d3.sum(tableData, d => d.views);
                  const tCtr = tImp > 0 ? (tClicks / tImp) * 100 : 0;
                  const tCpm = tImp > 0 ? (tSpend / tImp) * 1000 : 0;
                  const tCpc = tClicks > 0 ? tSpend / tClicks : 0;
                  const tCpv = tViews > 0 ? tSpend / tViews : 0;
                  return (
                    <tr className="bg-[#011414]/80 border-t-2 border-[#c88214]/50">
                      <td className="py-4 px-4 text-sm font-black text-[#c88214]">Total</td>
                      {userRole !== 'non-finance' && <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tSpend * exRate)}</td>}
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tImp)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tClicks)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{formatShort(tViews)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{tCtr.toFixed(2)}%</td>
                      {userRole !== 'non-finance' && (
                        <>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpm * exRate)}</td>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpc * exRate)}</td>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpv * exRate)}</td>
                        </>
                      )}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>`;

const newTable = `<div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-[#eef7f5] flex items-center gap-3">
              <Activity className="text-[#c88214]" /> Performance Metrics Breakdown
              <InfoTooltip definition="Detailed breakdown of performance metrics by channel." />
            </h3>
            <MultiSelectDropdown 
              label=""
              options={AVAILABLE_METRICS} 
              selected={selectedMetrics} 
              onChange={setSelectedMetrics} 
            />
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#c88214]/20">
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 rounded-tl-xl">Channel</th>
                  {selectedMetrics.map((metricKey, i) => {
                     const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                     if (!mDef) return null;
                     const isLast = i === selectedMetrics.length - 1;
                     return (
                       <th key={metricKey} className={\`py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right \${isLast ? 'rounded-tr-xl' : ''}\`}>
                         {mDef.label}
                       </th>
                     )
                  })}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={row.channel} className={\`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors \${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/20'}\`}>
                    <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                    {selectedMetrics.map(metricKey => {
                       const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                       if (!mDef) return null;
                       return (
                         <td key={metricKey} className="py-4 px-4 text-sm font-medium text-white text-right">
                           {mDef.format(row[metricKey])}
                         </td>
                       );
                    })}
                  </tr>
                ))}
                {tableData.length > 0 && (() => {
                  const tSpend = d3.sum(tableData, d => d.spend);
                  const tImp = d3.sum(tableData, d => d.impressions);
                  const tClicks = d3.sum(tableData, d => d.clicks);
                  const tViews = d3.sum(tableData, d => d.views);
                  const tViews6s = d3.sum(tableData, d => d.views6s);
                  const tViews15s = d3.sum(tableData, d => d.views15s);
                  const tCompletions = d3.sum(tableData, d => d.completions);
                  
                  const totals = {
                     spend: tSpend,
                     impressions: tImp,
                     clicks: tClicks,
                     views: tViews,
                     views6s: tViews6s,
                     views15s: tViews15s,
                     completions: tCompletions,
                     ctr: tImp > 0 ? (tClicks / tImp) * 100 : 0,
                     cpm: tImp > 0 ? (tSpend / tImp) * 1000 : 0,
                     cpc: tClicks > 0 ? tSpend / tClicks : 0,
                     cpv: tViews > 0 ? tSpend / tViews : 0,
                     cpcv: tCompletions > 0 ? tSpend / tCompletions : 0
                  };

                  return (
                    <tr className="bg-[#011414]/80 border-t-2 border-[#c88214]/50">
                      <td className="py-4 px-4 text-sm font-black text-[#c88214]">Total</td>
                      {selectedMetrics.map(metricKey => {
                         const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                         if (!mDef) return null;
                         return (
                           <td key={metricKey} className="py-4 px-4 text-sm font-black text-[#c88214] text-right">
                             {mDef.format(totals[metricKey])}
                           </td>
                         );
                      })}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>`;

content = content.replace(oldTable, newTable);

fs.writeFileSync('app/CampaignView.jsx', content);
console.log("Successfully replaced content.");
