"""Inline styles, partials and scripts into self-contained HTML pages in public/."""
from pathlib import Path
root = Path(__file__).parent
src = root / 'src'
read = lambda name: (src / name).read_text()
SCRIPTS = ('worker.js', 'share-copy.js', 'app.js', 'share.js', 'stories.js', 'player.js', 'kinetic.js', 'ads-schedule.js', 'ads.js', 'advertise.js')
assert all('</script' not in read(f).lower() for f in SCRIPTS)
partials = {f'<!--{name.upper()}-->\n': read(f'partials/{name}.html') for name in ('header', 'footer', 'rails')}

def page(template, out, scripts):
    html = read(template)
    for marker, content in partials.items():
        html = html.replace(marker, content)
    html = html.replace('/*STYLE*/', read('style.css')).replace('/*WORKER*/', read('worker.js'))
    # Each page's script is one module, so the files share one scope.
    html = html.replace(scripts[0], '\n'.join(read(f) for f in scripts[1]))
    path = root / 'public' / out
    path.parent.mkdir(exist_ok=True)
    path.write_text(html)
    print(path, len(html.encode()), 'bytes')

page('index.html', 'index.html', ('/*APP*/', ('share-copy.js', 'app.js', 'share.js', 'stories.js', 'player.js', 'kinetic.js', 'ads-schedule.js', 'ads.js')))
page('advertise.html', 'advertise.html', ('/*ADVERTISE*/', ('ads-schedule.js', 'ads.js', 'advertise.js')))
