import glob
import os

replacements = {
    'bg-[#113A42]': 'card-surface backdrop-blur-2xl',
    'bg-[#0C272D]': 'bg-[#011414]',
    'text-[#74FA93]': 'text-[#c88214]',
    'border-[#74FA93]/20': 'border-[#c88214]/20',
    'border-[#74FA93]/30': 'border-[#c88214]/30',
    'border-[#74FA93]/50': 'border-[#c88214]/50',
    'border-[#74FA93]/10': 'border-[#c88214]/10',
    'bg-[#74FA93]/10': 'bg-[#c88214]/10',
    'hover:border-[#74FA93]/50': 'hover:border-[#c88214]/50',
    'bg-[#0E3037]': 'bg-[#011414]',
    'bg-[#065c5d]': 'bg-[#065c5d]',
    'border-[#74FA93]': 'border-[#c88214]'
}

jsx_files = glob.glob('app/**/*.jsx', recursive=True)

for file_path in jsx_files:
    if file_path == 'app/page.jsx':
        continue # page.jsx is already updated manually
        
    with open(file_path, 'r') as f:
        content = f.read()

    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated {file_path}")

print("Done replacing backgrounds.")
