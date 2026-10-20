"""Inline style, worker and app into one self-contained HTML file."""
from pathlib import Path
src = Path(__file__).parent / 'src'
html = (src / 'index.html').read_text()
worker = (src / 'worker.js').read_text()
assert '</script' not in worker.lower() and '</script' not in (src / 'app.js').read_text().lower()
for key, name in [('/*STYLE*/', 'style.css'), ('/*WORKER*/', 'worker.js'), ('/*APP*/', 'app.js')]:
    html = html.replace(key, (src / name).read_text())
out = Path(__file__).parent / 'public' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, len(html.encode()), 'bytes')
