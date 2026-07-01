"""EtherFantasy MOBA local server.
Serves the game folder over HTTP (like python -m http.server) and additionally
accepts POST /upload?name=<shot> with a PNG dataURL body -> saves wiki_img/<shot>.png
(used by the in-game F9 wiki-screenshot helper)."""
import http.server, socketserver, os, base64, sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
# Port: optional CLI arg (`python serve.py 8011`), else env PORT, else 8000.
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else int(os.environ.get('PORT', '8000'))

def lan_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class H(http.server.SimpleHTTPRequestHandler):
    VRM_DIR = r'A:\EF Models\VRM_Pipeline\out'  # external VRM drops, served read-only for the audit tool

    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/':
            self.path = '/launcher.html'  # game-select menu (MOBA + EF HUNT)
        if p == '/listvrm':
            import json as _json
            try:
                files = sorted(f for f in os.listdir(self.VRM_DIR)
                               if f.lower().endswith(('.vrm', '.glb')))
            except Exception:
                files = []
            body = _json.dumps(files).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if p.startswith('/vrmfile/'):
            import urllib.parse as _up
            name = os.path.basename(_up.unquote(p[len('/vrmfile/'):]))
            fp = os.path.join(self.VRM_DIR, name)
            if name.lower().endswith(('.vrm', '.glb', '.fbx')) and os.path.isfile(fp):
                data = open(fp, 'rb').read()
                self.send_response(200)
                self.send_header('Content-Type', 'model/gltf-binary')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()
            return
        if urlparse(self.path).path == '/listpets':
            import json as _json
            try:
                files = sorted(f for f in os.listdir(os.path.join(ROOT, 'pets')) if f.lower().endswith('.glb'))
            except Exception:
                files = []
            try:  # hero/ folder models (Irene costumes etc.) join the audit grid with a path prefix
                files += sorted('hero/' + f for f in os.listdir(os.path.join(ROOT, 'hero'))
                                if f.lower().endswith(('.glb', '.vrm')))
            except Exception:
                pass
            # NPC-type model folders, split by type: boss/ (boss models), masters/ (recruitable
            # helpers), mons/ (underling monsters). npc/ kept for any legacy stragglers.
            for _sub in ('boss', 'masters', 'mons', 'npc'):
                try:
                    files += sorted(_sub + '/' + f for f in os.listdir(os.path.join(ROOT, _sub))
                                    if f.lower().endswith(('.glb', '.vrm')))
                except Exception:
                    pass
            body = _json.dumps(files).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if urlparse(self.path).path == '/lanurl':
            body = ('http://%s:%d/' % (lan_ip(), PORT)).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        p = urlparse(self.path)
        if p.path == '/upload':
            q = parse_qs(p.query)
            name = (q.get('name', ['shot'])[0])
            name = ''.join(c for c in name if c.isalnum() or c in '-_')[:40] or 'shot'
            ln = int(self.headers.get('Content-Length', '0') or 0)
            if ln > 30_000_000:
                self.send_response(413); self.end_headers(); return
            data = self.rfile.read(ln).decode('ascii', 'ignore')
            if ',' in data and data.startswith('data:image'):
                data = data.split(',', 1)[1]
            try:
                raw = base64.b64decode(data)
            except Exception:
                self.send_response(400); self.end_headers(); return
            os.makedirs(os.path.join(ROOT, 'wiki_img'), exist_ok=True)
            with open(os.path.join(ROOT, 'wiki_img', name + '.png'), 'wb') as f:
                f.write(raw)
            print('saved wiki_img/%s.png (%d bytes)' % (name, len(raw)))
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain'); self.end_headers()
            self.wfile.write(b'ok')
        else:
            self.send_response(404); self.end_headers()

print('=' * 58)
print('  EtherFantasy menu  ->  http://localhost:%d/   (MOBA + EF HUNT)' % PORT)
print('  game client        ->  http://localhost:%d/index.html' % PORT)
print('  (wiki screenshot upload enabled: press F9 in game)')
print('=' * 58)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), H) as httpd:
    httpd.serve_forever()
