import re

print("=== SEARCHING dataset_loader.py FOR TEXT FORMATTING ===\n")

try:
    with open("dataset_loader.py", "r", encoding="utf-8") as f:
        content = f.read()
        
    # Look for lines where 'text' is created from prompt/completion
    lines = content.split('\n')
    found = False
    for i, line in enumerate(lines):
        if 'text' in line.lower() and ('prompt' in line.lower() or 'completion' in line.lower() or 'format' in line.lower() or 'f"' in line or "f'" in line):
            # Print the line and a few surrounding lines for context
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            print(f"Line {i+1}:")
            for j in range(start, end):
                marker = " >>> " if j == i else "     "
                print(f"{marker}{lines[j]}")
            print("-" * 60)
            found = True
            
    if not found:
        print("Could not find explicit 'text' formatting. It might be using a default Hugging Face dataset mapping.")
        print("Common defaults are: '{prompt}\\n{completion}' or '{prompt} {completion}'")

except FileNotFoundError:
    print("❌ dataset_loader.py not found. Please check the file name.")