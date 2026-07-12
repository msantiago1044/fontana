import re

with open('c:/Users/marce/Documents/fontana/web/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace style block
html = re.sub(r'(?s)<style>.*?</style>', r'<link rel="stylesheet" href="fontana.css">', html)

# Replace the LAST script block which is our application logic.
html = re.sub(r'(?s)<script>(?!.*?<script>).*?</script>', r'<script src="fontana.js"></script>', html)

with open('c:/Users/marce/Documents/fontana/web/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
