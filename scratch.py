import re

with open('app/CreativeView.jsx', 'r') as f:
    content = f.read()

# 1. Remove viewMode state
content = re.sub(
    r"const \[viewMode, setViewMode\] = useState\('grid'\);\s*",
    r"",
    content
)

# 2. Move Metrics filter to the search bar div, remove Grid/List toggle, and remove grid view render
content = re.sub(
    r'<MultiSelectDropdown label="Metrics".*?/>',
    r'',
    content
)

# The metrics filter string to insert
metrics_filter = r"""<div className="w-64">
               <MultiSelectDropdown label="Metrics" options={availableMetrics} selected={selectedMetrics} onChange={setSelectedMetrics} />
            </div>"""

content = re.sub(
    r'<div className="flex gap-2">[\s\S]*?</button>\s*</div>\s*</div>',
    metrics_filter + '\n         </div>',
    content
)

# Replace the grid conditional render block
content = re.sub(
    r'\{viewMode === \'grid\' \? \([\s\S]*?\) : \(\s*(<div className="card-surface backdrop-blur-2xl rounded-3xl)',
    r'\1',
    content
)

# Remove the closing brace of the ternary
content = re.sub(
    r'</table>\s*</div>\s*\)\}\s*</div>',
    r'</table>\n         </div>\n      </div>',
    content
)

# Adjust the grid class for filters since we removed the Metrics filter from it
content = re.sub(
    r'className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8 border-b border-\[#c88214\]/20 pb-6"',
    r'className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 border-b border-[#c88214]/20 pb-6"',
    content
)

# 3. Add `group` class to thumbnail div in list view
content = re.sub(
    r'className={`w-16 h-10 bg-\[#011414\] rounded-lg overflow-hidden border border-\[#c88214\]/20 flex items-center justify-center relative \$\{c\.adImageUrl \|\| c\.videoUrl \|\| c\.postUrl \? \'cursor-pointer\' : \'cursor-default\'\}`\}',
    r'className={`group w-16 h-10 bg-[#011414] rounded-lg overflow-hidden border border-[#c88214]/20 flex items-center justify-center relative ${c.adImageUrl || c.videoUrl || c.postUrl ? \'cursor-pointer\' : \'cursor-default\'}`}',
    content
)

with open('app/CreativeView.jsx', 'w') as f:
    f.write(content)

print("CreativeView.jsx updated")
