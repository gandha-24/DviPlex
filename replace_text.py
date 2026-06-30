from pathlib import Path
path = Path('index.html')
text = path.read_text(encoding='utf-8')
replacements = [
    ('Watercolor Portrait — WS', 'Watercolor Splash Portrait'),
    ('Watercolor Pastel Portrait — WP', 'Watercolor Pastel Portrait'),
    ('Line Art Portrait — LA', 'Line Art Portrait'),
    ('Caricature Portrait — CP', 'Caricature Portrait'),
    ('Anime Portrait — AP', 'Anime Portrait'),
    ('Word Art — WA', 'Word Art'),
    ('Line Art Pet — LP', 'Pet Line Art'),
    ('Story Book — S', 'Kids Story Book'),
    ('WS Style', 'Watercolor Splash'),
    ('WP Style', 'Watercolor Pastel'),
    ('LA Style', 'Line Art'),
    ('CP Style', 'Caricature'),
    ('AP Style', 'Anime'),
    ('WA Style', 'Word Art'),
    ('LP Style', 'Pet Line Art'),
    ('S Style', 'Story Book'),
    ('Digital portrait · Personalized text · Print-ready 300 DPI', 'Premium Digital Art · Personalised Name · Print Ready 300 DPI'),
    ('Digital book art · Personalized name · Print-ready 300 DPI', 'Premium Story Book Art · Personalised Name · Print Ready 300 DPI'),
]
counts = {}
for old, new in replacements:
    cnt = text.count(old)
    counts[old] = cnt
    text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('Replacements applied:')
for old, new in replacements:
    if counts[old] > 0:
        print(f"{old!r} => {new!r}: {counts[old]}")
print('Total replacements:', sum(counts.values()))
