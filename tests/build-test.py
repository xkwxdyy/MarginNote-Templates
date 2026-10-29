#!/usr/bin/env python3
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve() / 'clean checkout'
        self.root.mkdir()
        for directory in ('templates', 'scene-plugins'):
            shutil.copytree(ROOT / directory, self.root / directory)
        for name in ('source-baselines.json', 'dependencies.json'):
            shutil.copyfile(ROOT / name, self.root / name)
        spec = importlib.util.spec_from_file_location('builder', ROOT / 'tools/build-channels.py')
        self.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.builder)
        self.builder.ROOT = self.root
        self.builder.SCENE_ADDONS = {addon: self.root / source.relative_to(ROOT) for addon, source in self.builder.SCENE_ADDONS.items()}
        self.output = self.root / 'output'

    def tearDown(self):
        self.temp.cleanup()

    def test_all_templates_and_source_parity(self):
        report = self.builder.build()
        self.assertEqual(len(report['templates']), 8)
        self.assertEqual(len({row['id'] for row in report['templates']}), 8)
        for row in report['templates']:
            source = self.root / 'templates' / row['channel'] / row['scene']
            with zipfile.ZipFile(self.output / row['file']) as package:
                self.assertIsNone(package.testzip())
                self.assertEqual(package.read('template.json'), (source / 'template.json').read_bytes())
                template = json.loads(package.read('template.json'))
                manifest = json.loads(package.read('manifest.json'))
                expected = set(template['plugins']) & set(self.builder.SCENE_ADDONS)
                self.assertEqual({item['pluginID'] for item in manifest['plugins']}, expected)
                self.assertEqual({name.split('/')[1] for name in package.namelist() if name.startswith('plugins/')}, expected)
                self.assertFalse(any('mnpinner' in name.lower() or 'mnliterature' in name.lower() for name in package.namelist()))
                for addon in expected:
                    for file in self.builder.SCENE_ADDONS[addon].iterdir():
                        if file.is_file():
                            self.assertEqual(package.read('plugins/' + addon + '/' + file.name), file.read_bytes())
        before = {row['file']: row['sha256'] for row in report['templates']}
        after = {row['file']: row['sha256'] for row in self.builder.build()['templates']}
        self.assertEqual(before, after, 'Build output must be reproducible')
        addons = self.builder.build_addons()
        self.assertEqual(len(addons), 2)
        for row in addons:
            with zipfile.ZipFile(self.output / row['file']) as package:
                self.assertEqual(json.loads(package.read('mnaddon.json'))['addonid'], row['addon'])

    def test_main_baseline_cannot_change(self):
        path = self.root / 'templates/main/broad/template.json'
        template = json.loads(path.read_text())
        template['name'] = 'changed'
        path.write_text(json.dumps(template))
        with self.assertRaisesRegex(ValueError, 'confirmed baseline'):
            self.builder.build()
        self.assertFalse(self.output.exists())

    def test_channel_identity_and_config_guards(self):
        path = self.root / 'templates/dev/intensive/template.json'
        original = json.loads(path.read_text())
        for change in ({'id': original['id'].removesuffix('-dev')}, {'plugins': []}, {'pluginConfigs': {'unknown.plugin': {}}}):
            template = copy.deepcopy(original)
            template.update(change)
            path.write_text(json.dumps(template))
            with self.assertRaises(ValueError):
                self.builder.build()
            self.assertFalse(self.output.exists())

    def test_external_symlink_is_not_a_source(self):
        source = self.builder.SCENE_ADDONS['marginnote.extension.mnreadingscene'] / 'main.js'
        external = Path(self.temp.name) / 'private.js'
        external.write_bytes(source.read_bytes())
        source.unlink()
        source.symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'inside this checkout'):
            self.builder.build()
        self.assertFalse(self.output.exists())

    def test_selection_preserves_existing_report(self):
        first = self.builder.build(channels=('main',), modes=('broad',))
        self.assertEqual(len(first['templates']), 1)
        second = self.builder.build(channels=('dev',), modes=('intensive',))
        self.assertEqual(len(second['templates']), 1)
        combined = json.loads((self.output / 'build-report.json').read_text())
        self.assertEqual(len(combined['templates']), 2)
        for kwargs in ({'channels': ()}, {'channels': ('unknown',)}, {'modes': ('unknown',)}):
            with self.assertRaises(ValueError):
                self.builder.build(**kwargs)

    def test_undeclared_addon_file_is_rejected(self):
        source = self.builder.SCENE_ADDONS['marginnote.extension.mnreadingscene']
        (source / 'extra-private.js').write_text('throw new Error("not a distribution input")')
        with self.assertRaisesRegex(ValueError, 'Unexpected scene addon payload'):
            self.builder.build()
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
