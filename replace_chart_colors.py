import os
import glob

replacements = {
    '#736BED': '#c88214', # Purple -> Gold
    '#736bed': '#c88214',
    '#A29CF0': '#00937b', # Light Purple -> Teal Green
    '#a29cf0': '#00937b',
    '#D1CFF9': '#007542', # Very Light Purple -> Medium Green
    '#d1cff9': '#007542',
    '#8B5CF6': '#065c5d', # Deep Purple -> Dark Teal
    '#8b5cf6': '#065c5d',
    '#3B82F6': '#00937b', # Blue -> Teal Green
    '#3b82f6': '#00937b',
    '#F59E0B': '#c88214', # Orange -> Gold
    '#f59e0b': '#c88214',
    '#FFD166': '#c88214', # Yellow -> Gold
    '#ffd166': '#c88214',
    '#EF476F': '#007542', # Pink -> Medium Green
    '#ef476f': '#007542'
}

jsx_files = glob.glob('app/**/*.jsx', recursive=True)

for file_path in jsx_files:
    with open(file_path, 'r') as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated {file_path}")

print("Done.")
