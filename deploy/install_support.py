#!/usr/bin/env python3
"""Small, dependency-free helpers shared by the Linux installers (Python 3.9+)."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
from contextlib import closing
import re
import secrets
import shlex
import sqlite3
import tarfile


def node_artifact(manifest, arch):
    pattern = re.compile(r"([a-fA-F0-9]{64})\s+(node-v(24)\.(\d+)\.(\d+)-linux-" + re.escape(arch) + r"\.tar\.xz)")
    matches = [pattern.fullmatch(line.strip()) for line in manifest.splitlines()]
    matches = [m for m in matches if m]
    if len(matches) != 1 or int(matches[0][4]) < 19:
        raise ValueError("Node 24.19+ official Linux archive was not found uniquely")
    m = matches[0]
    return m[1].lower(), m[2]


def extract_archive(archive, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("Archive destination must be empty")
    with tarfile.open(archive, "r:*") as stream:
        entries = stream.getmembers()
        if len(entries) > 200000 or sum(e.size for e in entries) > 2 * 1024**3:
            raise ValueError("Archive exceeds the deployment size limit")
        for entry in entries:
            parts = PurePosixPath(entry.name).parts
            if PurePosixPath(entry.name).is_absolute() or ".." in parts or "\\" in entry.name:
                raise ValueError("Unsafe archive path")
            if not (entry.isfile() or entry.isdir() or entry.issym() or entry.islnk()):
                raise ValueError("Special files are not allowed in application archives")
        if hasattr(tarfile, "data_filter"):
            stream.extractall(destination, members=entries, filter="data")
        else:
            # Older vendor Python versions may lack the backported safe filter.
            if any(e.issym() or e.islnk() for e in entries):
                raise ValueError("Python lacks safe tar link filtering; update Python or build from source")
            stream.extractall(destination, members=entries)


def environment(existing, domain, port, output):
    values = {}
    if existing and Path(existing).exists():
        for line in Path(existing).read_text().splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            key, separator, raw = line.partition("=")
            if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
                raise ValueError("Unsupported environment-file syntax; no files were overwritten")
            parsed = shlex.split(raw, comments=False)
            if len(parsed) > 1:
                raise ValueError("Quote environment values containing whitespace")
            values[key] = parsed[0] if parsed else ""
    for name in ("BOOTSTRAP_ADMIN_TOKEN", "COLLECTOR_SERVICE_TOKEN"):
        current = values.get(name)
        if name == "COLLECTOR_SERVICE_TOKEN" and name in values and not current:
            raise ValueError("Existing COLLECTOR_SERVICE_TOKEN is empty; replace it explicitly")
        if current and (len(current) < 32 or current.startswith("replace-with-")):
            raise ValueError("Existing " + name + " is a placeholder or too short; replace it explicitly")
    if "COLLECTOR_SERVICE_TOKEN" not in values:
        values["COLLECTOR_SERVICE_TOKEN"] = secrets.token_hex(32)
    # A removed bootstrap token stays removed during upgrades.
    if not existing or not Path(existing).exists():
        values["BOOTSTRAP_ADMIN_TOKEN"] = secrets.token_hex(32)
    values.update(AUTH_MODE="standalone", HOST="127.0.0.1", PORT=str(port),
                  DATA_DIR="/var/lib/period-observer", MIGRATIONS_DIR="/opt/period-observer/current/drizzle",
                  VINEXT_TRUST_PROXY="1", VINEXT_TRUSTED_HOSTS=domain)
    target = Path(output)
    target.write_text("# Managed by lottery-observer Linux installer\n" + "\n".join(
        key + '="' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
        for key, value in values.items()) + "\n")
    target.chmod(0o600)


def database_backup(database, output):
    database, output = Path(database), Path(output)
    if not database.exists():
        return
    if output.exists():
        raise ValueError("Database backup already exists")
    with closing(sqlite3.connect(database, timeout=30)) as source, closing(sqlite3.connect(output)) as target:
        source.backup(target)
        if target.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("Database backup failed integrity check")
    output.chmod(0o600)


def templates(domain, port, cert, key, output):
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*[a-z0-9]|[a-z0-9]", domain) or not 1024 <= port <= 65535:
        raise ValueError("Invalid domain or backend port")
    if bool(cert) != bool(key) or any(not re.fullmatch(r"/[A-Za-z0-9_./-]+", p) for p in (cert, key) if p):
        raise ValueError("Invalid TLS certificate path")
    root = Path(output)
    root.mkdir(parents=True, exist_ok=True)
    common = "# Managed by lottery-observer\n"
    node = "/opt/period-observer-node/current/bin/node"
    app = "/opt/period-observer/current"
    (root / "period-observer.service").write_text(common + f"""[Unit]
Description=Period Observer web service
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=period-observer
Group=period-observer
WorkingDirectory={app}
EnvironmentFile=/etc/period-observer.env
ExecStart={node} {app}/server.js
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/period-observer
[Install]
WantedBy=multi-user.target
""")
    (root / "period-observer-tick.service").write_text(common + f"""[Unit]
Description=Check collection and draw schedules
After=period-observer.service
[Service]
Type=oneshot
User=period-observer
Group=period-observer
WorkingDirectory={app}
EnvironmentFile=/etc/period-observer.env
ExecStart={node} {app}/tick.mjs
TimeoutStartSec=40min
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
""")
    (root / "period-observer-tick.timer").write_text(common + """[Unit]
Description=Check Period Observer schedules every minute
[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=1s
Persistent=true
[Install]
WantedBy=timers.target
""")
    nginx = common + f"server {{\n    listen 80;\n    server_name {domain};\n"
    if cert:
        nginx += f"""    return 301 https://{domain}$request_uri;
}}
server {{
    listen 443 ssl;
    server_name {domain};
    ssl_certificate {cert};
    ssl_certificate_key {key};
    ssl_protocols TLSv1.2 TLSv1.3;
"""
    nginx += f"""    client_max_body_size 2m;
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header CF-Connecting-IP "";
        proxy_read_timeout 180s;
        proxy_buffering off;
    }}
}}
"""
    (root / "period-observer.conf").write_text(nginx)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    node = sub.add_parser("node-artifact")
    node.add_argument("manifest"); node.add_argument("arch", choices=["x64", "arm64"])
    unpack = sub.add_parser("extract")
    unpack.add_argument("archive"); unpack.add_argument("destination")
    config = sub.add_parser("environment")
    config.add_argument("--existing"); config.add_argument("--domain", required=True)
    config.add_argument("--port", type=int, required=True); config.add_argument("--output", required=True)
    backup = sub.add_parser("backup")
    backup.add_argument("database"); backup.add_argument("output")
    render = sub.add_parser("templates")
    render.add_argument("--domain", required=True); render.add_argument("--port", type=int, required=True)
    render.add_argument("--cert", default=""); render.add_argument("--key", default="")
    render.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "node-artifact":
        print(" ".join(node_artifact(Path(args.manifest).read_text(), args.arch)))
    elif args.command == "extract":
        extract_archive(args.archive, args.destination)
    elif args.command == "environment":
        environment(args.existing, args.domain, args.port, args.output)
    elif args.command == "backup":
        database_backup(args.database, args.output)
    elif args.command == "templates":
        templates(args.domain, args.port, args.cert, args.key, args.output)


if __name__ == "__main__":
    main()
