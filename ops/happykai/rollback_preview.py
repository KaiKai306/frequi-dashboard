"""Restore the pre-preview public route on Japan; retain all bot data and files."""
import argparse
import datetime
from pathlib import Path
import shutil
import socket
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', required=True)
    args = parser.parse_args()
    assert socket.gethostname() == 'ser608738340395'
    root = Path('/opt/binance-quant')
    backup = Path(args.backup).resolve()
    assert backup.parent == root and backup.name.startswith('Caddyfile.before-trellis-')
    assert backup.is_file()
    subprocess.run(['docker', 'cp', str(backup), 'binance-quant-caddy:/tmp/preview-rollback.caddy'], check=True)
    subprocess.run(['docker', 'exec', 'binance-quant-caddy', 'caddy', 'validate',
                    '--config', '/tmp/preview-rollback.caddy', '--adapter', 'caddyfile'], check=True)
    current = root / 'Caddyfile'
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    saved = current.with_name('Caddyfile.before-preview-rollback-' + stamp)
    shutil.copy2(current, saved)
    # Keep the inode mounted by the existing public Caddy container.
    current.write_bytes(backup.read_bytes())
    try:
        subprocess.run(['docker', 'exec', 'binance-quant-caddy', 'caddy', 'reload',
                        '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True)
    except subprocess.CalledProcessError:
        current.write_bytes(saved.read_bytes())
        subprocess.run(['docker', 'exec', 'binance-quant-caddy', 'caddy', 'reload',
                        '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], check=True)
        raise
    subprocess.run(['docker', 'compose', '-f', str(root / 'compose.yaml'),
                    '-f', str(root / 'compose.preview.yaml'), 'stop', 'trellis-preview'], check=True)
    print('Preview route removed; original proxy hot reloaded; only preview container stopped.')


if __name__ == '__main__':
    main()
