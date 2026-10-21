"""Inline styles, partials and scripts into self-contained HTML pages in public/."""
import hashlib, json
from pathlib import Path
root = Path(__file__).parent
src = root / 'src'
read = lambda name: (src / name).read_text()
SCRIPTS = ('worker.js', 'redaction.js', 'share-copy.js', 'app.js', 'card.js', 'share.js', 'stories.js', 'player.js', 'kinetic.js', 'ads-schedule.js', 'ads.js', 'advertise.js', 'offline.js')
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

page('index.html', 'index.html', ('/*APP*/', ('redaction.js', 'share-copy.js', 'app.js', 'card.js', 'share.js', 'stories.js', 'player.js', 'kinetic.js', 'ads-schedule.js', 'ads.js', 'offline.js')))
page('advertise.html', 'advertise.html', ('/*ADVERTISE*/', ('ads-schedule.js', 'ads.js', 'advertise.js', 'offline.js')))
(root / 'public' / 'manifest.webmanifest').write_text(read('manifest.webmanifest'))

def service_worker():
    """Write public/sw.js with the release in its cache name and the files saved on first visit.

    SHELL is what works offline straight away: both pages (everything else they need is inline) plus the manifest and
    icons. Year themes under public/themes/<year>/ stay out of it; the worker saves them on first use or when they're
    prefetched. VERSION hashes every other file in public/, themes included, so any change to the site is a new release.
    """
    public = root / 'public'
    shell = ['/', '/advertise', '/manifest.webmanifest'] + sorted('/' + p.relative_to(public).as_posix() for p in (public / 'icons').iterdir() if not p.name.startswith('.'))
    digest = hashlib.sha256()
    for p in sorted(p for p in public.rglob('*') if p.is_file() and p.name != 'sw.js' and not p.name.startswith('.')):
        digest.update(p.relative_to(public).as_posix().encode() + b'\0' + p.read_bytes())
    version = json.loads((root / 'package.json').read_text())['version'] + '-' + digest.hexdigest()[:10]
    js = read('sw.js')
    for line, value in (("const VERSION = 'dev';", f'const VERSION = {json.dumps(version)};'), ("const SHELL = ['/'];", f'const SHELL = {json.dumps(shell)};')):
        assert line in js, line
        js = js.replace(line, value)
    (public / 'sw.js').write_text(js)
    print(public / 'sw.js', version)

service_worker()
