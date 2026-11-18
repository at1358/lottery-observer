"""Exercise generated phone redirects with an isolated loopback nginx and stub."""
import http.server
import importlib.util
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mobile_install_support', ROOT/'deploy/install_support.py')
support = importlib.util.module_from_spec(spec); spec.loader.exec_module(support)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): return None

class Stub(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def do_HEAD(self): self.send_response(200); self.end_headers()
    def do_POST(self): self.do_GET()
    def log_message(self, *args): pass

class MobileNginxTests(unittest.TestCase):
    def test_safe_phone_redirects_and_unchanged_other_requests(self):
        nginx=shutil.which('nginx')
        if not nginx: self.skipTest('nginx is required for the real routing check')
        upstream=http.server.ThreadingHTTPServer(('127.0.0.1',0),Stub)
        threading.Thread(target=upstream.serve_forever,daemon=True).start()
        try:
            with tempfile.TemporaryDirectory(prefix='observer-mobile-nginx-') as temporary:
                root=Path(temporary);support.templates('localhost',upstream.server_port,'','',root)
                with socket.socket() as available: available.bind(('127.0.0.1',0));port=available.getsockname()[1]
                server=(root/'period-observer.conf').read_text().replace('listen 80;',f'listen 127.0.0.1:{port};')
                config=root/'nginx.conf';config.write_text(f'pid {root}/nginx.pid;\nerror_log {root}/error.log;\nevents {{}}\nhttp {{ access_log off;\n'+server+'\n}')
                args=[nginx,'-p',str(root)+'/', '-c',str(config)]
                subprocess.run([*args,'-t'],check=True,capture_output=True)
                subprocess.run(args,check=True,capture_output=True)
                try:
                    phone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
                    opener=urllib.request.build_opener(NoRedirect())
                    cases=[('GET','/?view=ranking&year=2026',phone,302,'/m?view=ranking&year=2026'),('HEAD','/',phone,302,'/m'),('GET','/materials/column-1?year=2026',phone,302,'/m/materials/column-1?year=2026'),('GET','/self-materials/plan-1',phone,302,'/m/self-materials/plan-1'),('GET','/','Mozilla/5.0 Android Mobile',302,'/m'),('GET','/','Desktop Chrome',200,None),('GET','/','Mozilla/5.0 (Android Tablet)',200,None)]
                    cases += [('GET',path,phone,200,None) for path in ['/m','/m?view=ranking','/m/materials/column-1','/api/state','/api/auth/login','/assets/app.js','/_next/static/app.js','/favicon.svg','/unknown']]
                    cases.append(('POST','/',phone,200,None))
                    for method,path,agent,status,location in cases:
                        with self.subTest(method=method,path=path,agent=agent):
                            request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,method=method,headers={'User-Agent':agent})
                            try: response=opener.open(request,timeout=10)
                            except urllib.error.HTTPError as error: response=error
                            with response:
                                self.assertEqual(response.status,status)
                                if location:
                                    target=urllib.parse.urlsplit(response.headers['Location']);self.assertEqual(target.path+('?' + target.query if target.query else ''),location)
                                else: self.assertIsNone(response.headers.get('Location'))
                                self.assertIn('User-Agent',response.headers.get('Vary',''))
                    print('PASS: 17 real nginx mobile/desktop/method/deep-link/query/API/asset/no-loop routing cases')
                finally: subprocess.run([*args,'-s','quit'],check=True,capture_output=True)
        finally: upstream.shutdown();upstream.server_close()

if __name__=='__main__': unittest.main()
