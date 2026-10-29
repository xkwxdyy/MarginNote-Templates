#!/usr/bin/env python3
"""Explicitly export the committed MNKB scene core; normal builds never run this."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'KnowledgeBaseResearchCore.js'
TARGET = 'mnkb-scene-core/' + SOURCE


def snapshot(source):
    source = Path(source).resolve()
    def git(*args):
        return subprocess.check_output(['git', '-C', str(source), *args])
    if Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve() != source:
        raise ValueError('Source must be the MNKnowledgeBase repository root')
    metadata = json.loads((source / 'mnaddon.json').read_text())
    if metadata.get('addonid') != 'marginnote.extension.mnknowledgebase':
        raise ValueError('Unexpected source addon identity')
    if git('status', '--porcelain', '--', SOURCE).strip():
        raise ValueError('Commit the core change in MNKnowledgeBase before exporting')
    data = git('show', 'HEAD:' + SOURCE)
    if (source / SOURCE).is_symlink() or data != (source / SOURCE).read_bytes():
        raise ValueError('Source differs from committed MNKB core')
    return data, git('rev-parse', 'HEAD').decode().strip()


def export(source, check=False):
    data, commit = snapshot(source)
    digest = hashlib.sha256(data).hexdigest()
    provenance = ROOT / 'source-baselines.json'
    metadata = json.loads(provenance.read_text())
    row = next(item for item in metadata['extractedSources'] if item['path'] == TARGET)
    if check:
        if data != (ROOT / TARGET).read_bytes() or row['sha256'] != digest:
            raise ValueError('Exported core differs from the selected committed MNKB source')
    else:
        (ROOT / TARGET).write_bytes(data)
        row.update({'sha256': digest, 'upstream': 'https://github.com/xkwxdyy/MNKnowledgeBase', 'sourceCommit': commit, 'maintenance': 'MNKnowledgeBase; exported snapshot only'})
        provenance.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'sha256': digest, 'sourceCommit': commit, 'checkedOnly': check, 'uploaded': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.check)))
