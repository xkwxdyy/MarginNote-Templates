#!/usr/bin/env python3
"""Build templates from this checkout only; never install or restart MarginNote."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import os
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SCENES = {
    'broad': ('自由收集', 'u-broad-reading-workflow'),
    'intensive': ('知识学习', 'u-intensive-reading-workflow'),
    'research': ('课题研究', 'u-research-workflow'),
    'literature': ('文献研读', 'u-literature-reading-workflow'),
}
SCENE_ADDONS = {
    'marginnote.extension.mnreadingscene': ROOT / 'scene-plugins/reading-scene/plugin/src',
    'marginnote.extension.mnresearchscene': ROOT / 'scene-plugins/research-scene/plugin/src',
}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    path = Path(path)
    if path.is_symlink() or not path.resolve().is_relative_to(ROOT) or not path.is_file():
        raise ValueError('Source must be a regular file inside this checkout: ' + str(path))
    return path.read_bytes()


def addon_members(addon, source):
    names = {p.name for p in source.iterdir()}
    allowed = set(json.loads(source_bytes(ROOT / 'dependencies.json'))['sceneAddonPayloads'][addon])
    if names != allowed or not {'main.js', 'mnaddon.json', 'icon.png'} <= names:
        raise ValueError('Unexpected scene addon payload: ' + addon)
    data = {name: source_bytes(source / name) for name in sorted(names)}
    identity = json.loads(data['mnaddon.json'])
    if identity.get('addonid') != addon:
        raise ValueError('Scene addon identity mismatch')
    return data, identity


def archive(target, members):
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.build-', dir=target.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, 'w') as package:
            for name, data in sorted(members.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, data)
        with zipfile.ZipFile(temporary) as package:
            if package.testzip() is not None or set(package.namelist()) != set(members):
                raise ValueError('Archive integrity failure')
            if any(package.read(name) != value for name, value in members.items()):
                raise ValueError('Archive/source parity failure')
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def build(output=None, channels=('main', 'dev'), modes=None):
    output = Path(output) if output else ROOT / 'output'
    if not channels or len(set(channels)) != len(channels) or any(c not in ('main', 'dev') for c in channels):
        raise ValueError('Invalid template channel')
    if modes is not None and (not modes or len(set(modes)) != len(modes) or any(m not in SCENES for m in modes)):
        raise ValueError('Invalid template scene')
    baselines = json.loads(source_bytes(ROOT / 'source-baselines.json'))['main']
    addons = {addon: addon_members(addon, source) for addon, source in SCENE_ADDONS.items()}
    plans, identities = [], set()
    for channel in channels:
        for mode, (title, main_id) in SCENES.items():
            if modes is not None and mode not in modes:
                continue
            folder = ROOT / 'templates' / channel / mode
            raw = {name: source_bytes(folder / name) for name in ('template.json', 'manifest.json')}
            if channel == 'main' and any(sha(data) != baselines.get((folder / name).relative_to(ROOT).as_posix()) for name, data in raw.items()):
                raise ValueError('Main source differs from its confirmed baseline: ' + mode)
            template, manifest = (json.loads(raw[name]) for name in ('template.json', 'manifest.json'))
            identity = main_id + ('-dev' if channel == 'dev' else '')
            if template.get('id') != identity or identity in identities or template.get('name') != title + ' · ' + channel:
                raise ValueError('Unexpected or duplicate template identity')
            identities.add(identity)
            if manifest.get('template') != {'id': identity, 'name': template['name']} or manifest.get('plugins') != []:
                raise ValueError('Source manifest identity or installation list mismatch')
            permissions = template.get('plugins')
            if not isinstance(permissions, list) or not permissions or not all(isinstance(v, str) and v for v in permissions) or len(set(permissions)) != len(permissions):
                raise ValueError('Runtime plugin allowlist must be preserved')
            if not isinstance(template.get('pluginConfigs'), dict) or not set(template['pluginConfigs']) <= set(permissions):
                raise ValueError('Plugin configuration lacks runtime permission')
            installed = copy.deepcopy(manifest)
            members = {'template.json': raw['template.json']}
            for addon, (payload, metadata) in addons.items():
                if addon in permissions:
                    installed['plugins'].append({'pluginID': addon, 'folder': addon, 'version': metadata['version'], 'title': metadata['title']})
                    members.update({f'plugins/{addon}/{name}': data for name, data in payload.items()})
            members['manifest.json'] = encoded(installed)
            plans.append((channel, mode, title, template, installed, members))

    report = {'installed': False, 'deviceAcceptance': 'pending', 'pluginFilesIncluded': 'matching scene addons in main and dev', 'templates': []}
    for channel, mode, title, template, manifest, members in plans:
        target = output / channel / (title + '-' + channel + '.mntemplate')
        archive(target, members)
        report['templates'].append({
            'channel': channel, 'scene': mode, 'file': target.relative_to(output).as_posix(),
            'id': template['id'], 'name': template['name'], 'sha256': sha(target.read_bytes()),
            'allowedPlugins': template['plugins'], 'bundledPlugins': manifest['plugins'],
            'pluginConfigSHA256': sha(encoded(template['pluginConfigs'])),
            'templateSourceSHA256': sha(members['template.json']),
        })
    combined = copy.deepcopy(report)
    previous = output / 'build-report.json'
    if previous.exists():
        old = json.loads(previous.read_text())
        selected = {value['file'] for value in report['templates']}
        combined['templates'] = [value for value in old.get('templates', []) if value['file'] not in selected] + report['templates']
    combined['templates'].sort(key=lambda value: (value['channel'], value['scene']))
    (output / 'build-report.json').write_bytes(encoded(combined))
    (output / 'SHA256SUMS.txt').write_text(''.join(value['sha256'] + '  ' + value['file'] + '\n' for value in combined['templates']))
    return report


def build_addons(output=None):
    output = Path(output) if output else ROOT / 'output'
    entries = []
    for addon, source in SCENE_ADDONS.items():
        members, metadata = addon_members(addon, source)
        target = output / 'scene-addons' / (addon.rsplit('.', 1)[-1] + '-v' + metadata['version'] + '.mnaddon')
        archive(target, members)
        entries.append({'addon': addon, 'file': target.relative_to(output).as_posix(), 'sha256': sha(target.read_bytes())})
    (output / 'scene-addons' / 'build-report.json').write_bytes(encoded(entries))
    return entries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'output')
    parser.add_argument('--channel', choices=['main', 'dev'])
    parser.add_argument('--scene', choices=list(SCENES))
    parser.add_argument('--scene-addons', action='store_true')
    args = parser.parse_args()
    result = build(args.output, (args.channel,) if args.channel else ('main', 'dev'), (args.scene,) if args.scene else None)
    addons = build_addons(args.output) if args.scene_addons else []
    print(json.dumps({'templates': len(result['templates']), 'sceneAddons': len(addons), 'deviceAcceptance': 'pending'}))
