import pandas as pd

file_path = 'AFC_Gulf_Cup_Campaign.xlsx'
xl = pd.ExcelFile(file_path)

sheets_to_parse = [
    'Phase 1 - Aug - Sept (Launch)',
    'Phase 2 - Sep - Oct',
    'Song and Mascot Promotion'
]

for sheet in sheets_to_parse:
    if sheet in xl.sheet_names:
        df = xl.parse(sheet)
        # Drop rows where all elements are NaN
        df = df.dropna(how='all')
        print(f"\n--- {sheet} ---")
        print("First 20 non-empty rows:")
        for idx, row in df.head(20).iterrows():
            vals = [str(x) for x in row.values if pd.notna(x)]
            if vals:
                print(f"Row {idx}: {vals}")
