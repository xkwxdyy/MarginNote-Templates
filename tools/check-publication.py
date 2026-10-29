#!/usr/bin/env python3
"""Validate the explicit public file allowlist; ignored files are never inputs."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'publication-files.json'
FORBIDDEN = re.compile(r'(^|/)(?:(?:marginnote\.extension\.)?(?:mnpinner|mnliterature)(?:[./_-]|$)|(?:MEMORY|Resources|node_modules|output|dist|__pycache__|\.local|\.git|\.codex|\.agents)(?:/|$))|(?:\.local\.json|\.(?:mnaddon|mntemplate|log)|\.env(?:\.[^/]+)?)$', re.I)
PERSONAL = re.compile(r'/Users/|/Volumes/|[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}|marginnote[34]?app://note/[A-Za-z0-9-]{16,}|-----BEGIN [^-]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{30,}')


def check():
    files = json.loads(MANIFEST.read_text())['files']
    if files != sorted(set(files)) or 'publication-files.json' not in files:
        raise ValueError('Publication allowlist must be sorted and unique, including itself')
    records = []
    for name in files:
        path = ROOT / name
        if name.startswith('/') or '..' in Path(name).parts or '\\' in name or FORBIDDEN.search(name):
            raise ValueError('Forbidden publication path: ' + name)
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT) or not path.is_file():
            raise ValueError('Publication source must be a regular in-project file: ' + name)
        data = path.read_bytes()
        if path.suffix in ('.py', '.js', '.json', '.md', '.yml') and name != 'tools/check-publication.py' and PERSONAL.search(data.decode('utf-8')):
            raise ValueError('Potential personal or credential value requires review: ' + name)
        if path.suffix == '.md':
            body = re.sub(r'```.*?```', '', data.decode('utf-8'), flags=re.S)
            for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', body):
                if re.match(r'^[a-z]+:', target) or target.startswith('#'):
                    continue
                resolved = (path.parent / unquote(target.split('#')[0])).resolve()
                if not resolved.is_relative_to(ROOT) or not resolved.exists():
                    raise ValueError('Documentation link leaves the checkout or is broken: ' + name)
        records.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    # Git inventory is checked only for this project's own Git root.
    if (ROOT / '.git').exists():
        tracked = set(subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode().rstrip('\0').split('\0')) - {''}
        if tracked - set(files):
            raise ValueError('Git tracks files outside the allowlist: ' + ', '.join(sorted(tracked - set(files))))
    return {'repository': 'xkwxdyy/MarginNote-Templates', 'uploaded': False, 'files': records}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = check()
    if args.report:
        if args.report.resolve() == MANIFEST.resolve():
            raise ValueError('The review receipt cannot replace the allowlist')
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(result['files']), 'uploaded': False}))
