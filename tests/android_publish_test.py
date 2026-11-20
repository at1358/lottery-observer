"""Exercise the publisher's real Python block inside an isolated temporary root."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

class AndroidPublishTest(unittest.TestCase):
    def test_release_manifest_and_apk_are_consistent_and_cannot_be_downgraded(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            apk = directory / 'release.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('AndroidManifest.xml', b'manifest' * 1000)
                archive.writestr('classes.dex', b'dex' * 2000)
            digest = hashlib.sha256(apk.read_bytes()).hexdigest()
            target = directory / 'published'
            script = (ROOT / 'deploy/publish-android-apk.sh').read_text(encoding='utf-8').split("<<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
            script = script.replace("Path('/var/www/period-observer-app')", 'Path(' + repr(str(target)) + ')')
            def publish(version='1.1.0', code='2', checksum=digest):
                return subprocess.run([sys.executable, '-c', script, str(apk), checksum, version, code], capture_output=True, text=True)
            result = publish()
            self.assertEqual(result.returncode, 0, result.stderr)
            first = (target / 'latest.json').read_bytes()
            manifest = json.loads(first)
            self.assertEqual(manifest['versionCode'], 2)
            self.assertEqual(manifest['versionName'], '1.1.0')
            self.assertEqual(manifest['packageName'], 'com.aifx.observer')
            self.assertEqual(manifest['size'], apk.stat().st_size)
            self.assertEqual(manifest['sha256'], digest)
            self.assertEqual(manifest['url'], 'http://8.134.37.202/app-downloads/PeriodObserver-1.1.0.apk')
            self.assertEqual(hashlib.sha256((target / 'PeriodObserver-1.1.0.apk').read_bytes()).hexdigest(), digest)
            self.assertEqual(publish().returncode, 0)
            self.assertNotEqual(publish('1.0.0', '1').returncode, 0)
            self.assertNotEqual(publish('1.2.0', '2').returncode, 0)
            self.assertNotEqual(publish(checksum='0' * 64).returncode, 0)
            self.assertEqual((target / 'latest.json').read_bytes(), first)
            self.assertFalse(list(target.glob('.release-*')))

if __name__ == '__main__':
    unittest.main()
