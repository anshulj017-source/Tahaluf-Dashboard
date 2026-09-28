import glob

replacements = {
    '#CBBB9D': '#6fa89f',
    '#cbbb9d': '#6fa89f',
    '#F1EAD8': '#eef7f5',
    '#f1ead8': '#eef7f5',
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
