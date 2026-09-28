const fs = require('fs');
let content = fs.readFileSync('app/CustomView.jsx', 'utf8');

const dropOld = `const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex-1 relative min-w-[180px]">
      <span className="text-[10px] font-black uppercase text-[#6fa89f] mb-1.5 tracking-widest block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl text-sm font-black text-[#c88214] shadow-sm cursor-pointer flex justify-between items-center transition-colors hover:border-[#c88214]/50"
      >
        <span className="truncate pr-4">{selected.length === 0 ? 'All Selected' : selected.join(', ')}</span>
        <ChevronDown className={\`w-4 h-4 flex-shrink-0 transition-transform \${isOpen ? 'rotate-180' : ''}\`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchTerm(''); }} />
          <div className="absolute top-full left-0 w-full h-0 z-50">
            <div className="w-full mt-2 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-80 overflow-hidden">
              <div className="p-3 border-b border-[#c88214]/10 bg-[#011414]">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6fa89f] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    autoFocus 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full card-surface backdrop-blur-2xl text-white text-xs font-bold pl-9 pr-3 py-2.5 rounded-lg outline-none border border-[#c88214]/20 focus:border-[#c88214] transition-colors" 
                  />
                </div>
              </div>
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                <div 
                  onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }} 
                  className={\`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors \${selected.length === 0 ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}\`}
                >
                  All <Check className={\`w-4 h-4 \${selected.length === 0 ? 'opacity-100' : 'opacity-0'}\`} />
                </div>
                {filteredOptions.map(opt => {
                  const isSel = selected.includes(opt);
                  return (
                    <div 
                      key={opt} 
                      onClick={() => {
                        let next = [...selected];
                        if (isSel) {
                          next = next.filter(n => n !== opt);
                        } else { 
                          next.push(opt); 
                        }
                        onChange(next);
                      }} 
                      className={\`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors mt-1 \${isSel ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}\`}
                    >
                      {opt}
                      <Check className={\`w-4 h-4 \${isSel ? 'opacity-100' : 'opacity-0'}\`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};`;

const dropNew = `const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isObject = options.length > 0 && typeof options[0] === 'object';
  const filteredOptions = options.filter(o => {
    const text = isObject ? o.label : o;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex-1 relative min-w-[180px]">
      {label && <span className="text-[10px] font-black uppercase text-[#6fa89f] mb-1.5 tracking-widest block">{label}</span>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl text-sm font-black text-[#c88214] shadow-sm cursor-pointer flex justify-between items-center transition-colors hover:border-[#c88214]/50"
      >
        <span className="truncate pr-4">{selected.length === 0 ? 'All Selected' : (isObject ? \`\${selected.length} Selected\` : selected.join(', '))}</span>
        <ChevronDown className={\`w-4 h-4 flex-shrink-0 transition-transform \${isOpen ? 'rotate-180' : ''}\`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchTerm(''); }} />
          <div className="absolute top-full left-0 w-full h-0 z-50">
            <div className="w-full mt-2 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-80 overflow-hidden">
              <div className="p-3 border-b border-[#c88214]/10 bg-[#011414]">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6fa89f] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    autoFocus 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full card-surface backdrop-blur-2xl text-white text-xs font-bold pl-9 pr-3 py-2.5 rounded-lg outline-none border border-[#c88214]/20 focus:border-[#c88214] transition-colors" 
                  />
                </div>
              </div>
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                {!isObject && (
                <div 
                  onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }} 
                  className={\`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors \${selected.length === 0 ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}\`}
                >
                  All <Check className={\`w-4 h-4 \${selected.length === 0 ? 'opacity-100' : 'opacity-0'}\`} />
                </div>
                )}
                {filteredOptions.map(opt => {
                  const key = isObject ? opt.key : opt;
                  const text = isObject ? opt.label : opt;
                  const isSel = selected.includes(key);
                  return (
                    <div 
                      key={key} 
                      onClick={() => {
                        let next = [...selected];
                        if (isSel) {
                          next = next.filter(n => n !== key);
                        } else { 
                          next.push(key); 
                        }
                        onChange(next);
                      }} 
                      className={\`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors mt-1 \${isSel ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}\`}
                    >
                      {text}
                      <Check className={\`w-4 h-4 \${isSel ? 'opacity-100' : 'opacity-0'}\`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};`;

content = content.replace(dropOld, dropNew);
fs.writeFileSync('app/CustomView.jsx', content);
console.log("Dropdown updated.");
