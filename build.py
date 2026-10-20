"""Inline style, worker and app into one self-contained HTML file."""
from pathlib import Path
src = Path(__file__).parent / 'src'
html = (src / 'index.html').read_text()
worker = (src / 'worker.js').read_text()
assert all('</script' not in (src / f).read_text().lower() for f in ('worker.js', 'app.js', 'share.js', 'ads-schedule.js', 'ads.js'))
html = html.replace('/*STYLE*/', (src / 'style.css').read_text()).replace('/*WORKER*/', worker)
# The page script is one module: share.js and the ad files share app.js's scope.
html = html.replace('/*APP*/', '\n'.join((src / f).read_text() for f in ('app.js', 'share.js', 'ads-schedule.js', 'ads.js')))
out = Path(__file__).parent / 'public' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, len(html.encode()), 'bytes')
