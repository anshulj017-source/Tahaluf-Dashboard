import os
import re

directory = 'app'

def replace_tournament(text):
    text = re.sub(r'Tournaments', 'Events', text)
    text = re.sub(r'tournaments', 'events', text)
    text = re.sub(r'Tournament', 'Event', text)
    text = re.sub(r'tournament', 'event', text)
    return text

def apply_comments(text, filename):
    if filename == 'page.jsx':
        # Comment NAV item
        text = text.replace("{ id: 'webtraffic', label: 'Web Traffic', icon: Users },", "/* { id: 'webtraffic', label: 'Web Traffic', icon: Users }, */")
        
        # Comment GA4 cards
        text = re.sub(r'(<MetricCard[^>]+label="GA4 [^>]+/>)', r'{/* \1 */}', text)
        
        # Comment out MultiSelects for GA4
        text = re.sub(r'(<MultiSelect[^>]+label="GA4 Property"[^>]+/>)', r'{/* \1 */}', text)
        text = re.sub(r'(<MultiSelect[^>]+label="Traffic Source"[^>]+/>)', r'{/* \1 */}', text)

        # Comment out the block: if (activeTab === 'webtraffic') { ... }
        # Let's find it by string split
        if "if (activeTab === 'webtraffic') {" in text:
            start_idx = text.find("if (activeTab === 'webtraffic') {")
            end_idx = text.find("if (activeTab === 'creative') {")
            if start_idx != -1 and end_idx != -1:
                # Need to backtrack one closing brace before 'creative'
                actual_end = text.rfind("}", start_idx, end_idx) + 1
                
                block = text[start_idx:actual_end]
                text = text[:start_idx] + "/* \n" + block + "\n*/\n" + text[actual_end:]

        # Comment out Daily GA4 Sales Trend block (which starts with {/* Daily GA4 Sales Trend */})
        # Let's just comment out the whole JSX node.
        if "{/* Daily GA4 Sales Trend */}" in text:
            text = text.replace("{/* Daily GA4 Sales Trend */}", "{/* Daily GA4 Sales Trend")
            text = text.replace("          {/* End Daily GA4 Sales Trend */}", "          End Daily GA4 Sales Trend */}")
            # Wait, there is no End comment. Let's just find the div
            # I will use a simple regex to comment out the div containing "Daily GA4 Sales Trend"
            text = re.sub(r'(<div[^>]+data-title="Daily GA4 Sales Trend"[^>]*>.*?</div>)', r'{/* \1 */}', text, flags=re.DOTALL)
            # The above regex might match until the LAST </div> in the file because .*? is not matching nested divs properly.
            # Instead of regex, I'll use string replacement if possible.
            
    return text

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.tsx') or file.endswith('.js'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            new_content = replace_tournament(content)
            new_content = apply_comments(new_content, file)

            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
