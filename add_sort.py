import os
import re

VIEWS_DIR = 'app'

# Mapping of th labels to sort keys for different tables
SORT_KEYS = {
    'Spend': 'spend',
    'Impressions': 'impressions',
    'Clicks': 'clicks',
    'Video Views': 'views',
    'Completed Views': 'completions',
    'Conversions': 'conversions',
    'CPA': 'cpa',
    'CR': 'cr',
    'CTR': 'ctr',
    'CPM': 'cpm',
    'CPC': 'cpc',
    'CPV': 'cpv',
    'Planned Cost': 'plannedCost',
    'Delivered Cost': 'deliveredCost',
    'Booked Units': 'bookedUnits',
    'Delivered Units': 'deliveredUnits',
    '% Delivered': 'pctDelivered',
    '% Pacing': 'pctPacing',
    'Planned Unit Cost': 'plannedUnitCost',
    'Delivered Unit Cost': 'deliveredUnitCost',
    '% Diff Unit Cost': 'pctDiffUnitCost',
    'Buying Type': 'buyingType',
    'Event': 'event',
    'Date': 'dateObj',
    'Market': 'market',
    'Status': 'status',
    'Creative Name': 'creativeName',
    'Channel': 'channel',
    'Phase / Channel': 'channel',
    'Launch Date': 'startDate'
}

def add_sorting_to_headers(content, table_type="overall"):
    # table_type can be 'overall', 'planned', 'comparison'
    # this dictates which handleSort and sortConfig to use
    
    sort_func = "handleSort"
    sort_state = "sortConfig"
    if table_type == 'planned':
        sort_func = "handlePlannedSort"
        sort_state = "plannedSortConfig"
    elif table_type == 'comparison':
        sort_func = "handleComparisonSort"
        sort_state = "comparisonSortConfig"
    
    def repl(m):
        full_tag = m.group(0)
        attributes = m.group(1)
        inner_content = m.group(2)
        
        # Clean up inner content to find the column name
        # It might contain curly braces for conditionally rendered text, like {selectedPhases.length > 0 ? 'Phase / Channel' : 'Channel'}
        clean_name = re.sub(r'<[^>]+>', '', inner_content).strip()
        
        # Match "Channel" or "Phase / Channel"
        if "Phase / Channel" in inner_content:
            key = "channel"
        else:
            # Extract plain string if possible
            plain_match = re.search(r'([A-Za-z\s/%]+)', clean_name)
            if plain_match:
                candidate = plain_match.group(1).strip()
                key = SORT_KEYS.get(candidate, candidate.lower().replace(' ', ''))
            else:
                key = clean_name.lower().replace(' ', '')
                
            # Direct override for specific texts
            for k, v in SORT_KEYS.items():
                if k in inner_content:
                    key = v
                    break

        # Check if already clickable
        if 'onClick=' in attributes:
            return full_tag

        # Add cursor-pointer
        if 'className="' in attributes:
            new_attrs = attributes.replace('className="', 'className="cursor-pointer ')
        elif "className={`" in attributes:
            new_attrs = attributes.replace('className={`', 'className={`cursor-pointer ')
        else:
            new_attrs = attributes + ' className="cursor-pointer"'
            
        new_tag = f'<th onClick={{() => {sort_func}(\'{key}\')}} {new_attrs}>{inner_content} {{{sort_state}?.key === \'{key}\' ? ({sort_state}.direction === \'asc\' ? \' ↑\' : \' ↓\') : \'\'}}</th>'
        return new_tag

    # Regex to find th tags inside theads
    # We want to match <th ...>...</th>
    return re.sub(r'<th\s([^>]*)>(.*?)</th>', repl, content, flags=re.DOTALL)

for view in ['CampaignView.jsx', 'AdminView.jsx', 'ChannelView.jsx', 'MarketView.jsx', 'CustomView.jsx']:
    filepath = os.path.join(VIEWS_DIR, view)
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()

    # Need to split content by tables to apply different sorts?
    # In CampaignView we have 3 tables.
    if view == 'CampaignView.jsx':
        # Let's just do it manually for CampaignView using string splits
        parts = content.split('<table')
        if len(parts) == 4:
            # part 1: before first table (comparison table)
            # part 2: comparison table
            # part 3: overall table
            # part 4: planned table
            parts[1] = add_sorting_to_headers(parts[1], 'comparison')
            parts[2] = add_sorting_to_headers(parts[2], 'overall')
            parts[3] = add_sorting_to_headers(parts[3], 'planned')
            new_content = '<table'.join(parts)
        else:
            new_content = content # fallback
    else:
        new_content = add_sorting_to_headers(content, 'overall')

    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"Processed {view}")
