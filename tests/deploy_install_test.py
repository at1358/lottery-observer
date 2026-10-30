"""Installer contract tests; never run apt/dnf or modify host configuration."""
import importlib.util
import io
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from contextlib import closing

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("install_support", ROOT / "deploy/install_support.py")
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_official_node_manifest_selects_architecture_and_minimum_version(self):
        sha = "a" * 64
        manifest = f"{sha}  node-v24.22.2-linux-x64.tar.xz\n{'b'*64}  node-v24.22.2-linux-arm64.tar.xz\n{'c'*64}  node-v24.22.2-linux-x64-musl.tar.xz"
        self.assertEqual(support.node_artifact(manifest, "x64"), (sha, "node-v24.22.2-linux-x64.tar.xz"))
        self.assertEqual(support.node_artifact(manifest, "arm64")[0], "b"*64)
        for bad in (manifest.replace("24.22.2", "24.18.0"), "bad checksum", manifest+"\n"+manifest):
            with self.assertRaises(ValueError):
                support.node_artifact(bad, "x64")

    def test_environment_creates_private_distinct_secrets_and_loopback_backend(self):
        path = self.root / "environment"
        support.environment(None, "observer.example.com", 3000, path)
        text = path.read_text()
        tokens = re.findall(r'(?:BOOTSTRAP_ADMIN_TOKEN|COLLECTOR_SERVICE_TOKEN)="([a-f0-9]{64})"', text)
        self.assertEqual(len(tokens), 2)
        self.assertNotEqual(*tokens)
        self.assertIn('HOST="127.0.0.1"', text)
        self.assertIn('MIGRATIONS_DIR="/opt/period-observer/current/drizzle"', text)
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_upgrade_preserves_secrets_and_removed_bootstrap_token(self):
        existing, result = self.root / "existing", self.root / "result"
        existing.write_text('COLLECTOR_SERVICE_TOKEN="'+"a"*64+'"\nCUSTOM_VALUE="contains spaces"\n')
        support.environment(existing, "new.example.com", 3100, result)
        text = result.read_text()
        self.assertIn('COLLECTOR_SERVICE_TOKEN="'+"a"*64+'"', text)
        self.assertIn('CUSTOM_VALUE="contains spaces"', text)
        self.assertNotIn("BOOTSTRAP_ADMIN_TOKEN", text)
        self.assertIn('PORT="3100"', text)
        self.assertNotIn("new.example.com", existing.read_text())

    def test_placeholder_secret_is_rejected_without_overwriting(self):
        existing, result = self.root / "existing", self.root / "result"
        for token in ("", "short", "replace-with-a-long-random-service-secret"):
            existing.write_text("COLLECTOR_SERVICE_TOKEN="+token+"\n")
            with self.assertRaises(ValueError):
                support.environment(existing, "example.com", 3000, result)
            self.assertFalse(result.exists())

    def test_secret_with_hash_character_is_preserved(self):
        existing, result = self.root / "existing", self.root / "result"
        token = "a" * 32 + "#suffix"
        existing.write_text("COLLECTOR_SERVICE_TOKEN=" + token + "\n")
        support.environment(existing, "example.com", 3000, result)
        self.assertIn(token, result.read_text())

    def test_sqlite_backup_retains_committed_wal_and_rejects_overwrite(self):
        database, backup = self.root / "db.sqlite", self.root / "backup.sqlite"
        with closing(sqlite3.connect(database)) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE records(value TEXT)")
            connection.execute("INSERT INTO records VALUES('retained')")
            connection.commit()
            support.database_backup(database, backup)
            connection.execute("DELETE FROM records")
            connection.commit()
        with closing(sqlite3.connect(backup)) as copied:
            self.assertEqual(copied.execute("SELECT value FROM records").fetchone()[0], "retained")
        with self.assertRaises(ValueError):
            support.database_backup(database, backup)

    def archive(self, name, link=None, special=False):
        file = self.root / "app.tar"
        with tarfile.open(file, "w") as stream:
            info = tarfile.TarInfo(name)
            if special:
                info.type = tarfile.FIFOTYPE
            elif link is not None:
                info.type = tarfile.SYMTYPE; info.linkname = link
            else:
                info.size = 2
            stream.addfile(info, None if link is not None or special else io.BytesIO(b"ok"))
        return file

    def test_archive_accepts_normal_files(self):
        support.extract_archive(self.archive("dist/server.js"), self.root / "output")
        self.assertEqual((self.root / "output/dist/server.js").read_text(), "ok")

    def test_archive_rejects_traversal_external_links_and_special_files(self):
        for i, args in enumerate((("../escape",), ("/escape",), ("link", "../../escape"), ("fifo", None, True))):
            with self.assertRaises((ValueError, tarfile.FilterError)):
                support.extract_archive(self.archive(*args), self.root / str(i))
        self.assertFalse((self.root / "escape").exists())

    def test_archive_refuses_nonempty_destination(self):
        directory = self.root / "output"; directory.mkdir(); (directory / "existing").write_text("keep")
        with self.assertRaises(ValueError):
            support.extract_archive(self.archive("file"), directory)
        self.assertEqual((directory / "existing").read_text(), "keep")

    def test_templates_cover_tls_real_ip_timer_and_private_service_user(self):
        support.templates("observer.example.com", 3100, "/etc/ssl/certs/full.pem", "/etc/ssl/private/key.pem", self.root)
        nginx = (self.root / "period-observer.conf").read_text()
        self.assertIn("return 301 https://observer.example.com$request_uri;", nginx)
        self.assertIn("proxy_pass http://127.0.0.1:3100;", nginx)
        self.assertIn("X-Forwarded-For $remote_addr", nginx)
        self.assertIn('CF-Connecting-IP ""', nginx)
        self.assertNotIn("TLSv1.1", nginx)
        service = (self.root / "period-observer.service").read_text()
        self.assertIn("User=period-observer", service)
        self.assertIn("ProtectSystem=strict", service)
        self.assertIn("current/bin/node", service)
        self.assertIn("OnCalendar=*-*-* *:*:00", (self.root / "period-observer-tick.timer").read_text())
        self.assertIn("TimeoutStartSec=40min", (self.root / "period-observer-tick.service").read_text())

    def test_http_template_has_no_tls_or_redirect(self):
        support.templates("127.0.0.1", 3000, "", "", self.root)
        text = (self.root / "period-observer.conf").read_text()
        self.assertNotIn("ssl_certificate", text)
        self.assertNotIn("return 301", text)

    def test_templates_reject_injected_paths_or_domain(self):
        with self.assertRaises(ValueError):
            support.templates("example.com; bad", 3000, "", "", self.root)
        with self.assertRaises(ValueError):
            support.templates("example.com", 3000, "/cert; bad", "/key", self.root)


class ShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bash = os.environ.get("DEPLOY_BASH") or shutil.which("bash")
        if not cls.bash:
            raise unittest.SkipTest("Set DEPLOY_BASH or install Bash for installer CLI tests")

    def command(self, script, options, distro="ubuntu", version="24.04"):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary) / "os-release"
            fixture.write_text(f'ID="{distro}"\nVERSION_ID="{version}"\n')
            result = subprocess.run([self.bash, str(ROOT / "deploy" / script), *options], cwd=ROOT,
                                    env={**os.environ, "OBSERVER_DEPLOY_OS_RELEASE":fixture.as_posix()},
                                    capture_output=True, text=True, encoding="utf-8", timeout=20)
            return result

    def test_bash_syntax_and_help(self):
        for script in ("ubuntu-24.04.sh", "rocky-9.sh", "install-linux.sh"):
            result = subprocess.run([self.bash, "-n", str(ROOT / "deploy" / script)], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.command("ubuntu-24.04.sh", ["--help"]).returncode, 0)

    def test_ubuntu_dry_run_and_rocky_latest_minor(self):
        result = self.command("ubuntu-24.04.sh", ["--domain", "example.com", "--http-only", "--dry-run"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("apt-get", result.stdout)
        self.assertIn("127.0.0.1:3000", result.stdout)
        result = self.command("rocky-9.sh", ["--domain", "example.com", "--http-only", "--dry-run"], "rocky", "9.8")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("dnf", result.stdout)
        self.assertIn("SELinux", result.stdout)

    def test_reject_wrong_system_domain_port_and_missing_tls(self):
        base = ["--domain", "example.com", "--http-only", "--dry-run"]
        self.assertNotEqual(self.command("rocky-9.sh", base, "rocky", "10.0").returncode, 0)
        self.assertNotEqual(self.command("ubuntu-24.04.sh", base, "ubuntu", "22.04").returncode, 0)
        for flags in (["--domain", "bad;touch", "--http-only"], ["--domain", "example.com", "--http-only", "--port", "65536"], ["--domain", "example.com"], ["--unknown"]):
            self.assertNotEqual(self.command("ubuntu-24.04.sh", [*flags, "--dry-run"]).returncode, 0)

    def test_fixed_node_version_and_tls_dry_run(self):
        flags = ["--domain", "example.com", "--tls-cert", "/etc/certs/full.pem", "--tls-key", "/etc/certs/key.pem", "--node-version", "v24.22.2", "--dry-run"]
        result = self.command("ubuntu-24.04.sh", flags)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("https://example.com", result.stdout)
        self.assertIn("v24.22.2", result.stdout)
        self.assertNotEqual(self.command("ubuntu-24.04.sh", ["--domain", "example.com", "--http-only", "--node-version", "v24.18.0", "--dry-run"]).returncode, 0)


if __name__ == "__main__":
    unittest.main()
