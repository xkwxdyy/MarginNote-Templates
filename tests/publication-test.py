#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        for name in json.loads((ROOT / 'publication-files.json').read_text())['files']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        spec = importlib.util.spec_from_file_location('publication', ROOT / 'tools/check-publication.py')
        self.checker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.checker)
        self.checker.ROOT = self.root
        self.checker.MANIFEST = self.root / 'publication-files.json'
    def tearDown(self):
        self.temp.cleanup()
    def test_allowlisted_checkout_without_private_inputs(self):
        report = self.checker.check()
        self.assertFalse(report['uploaded'])
        self.assertEqual(len(report['files']), len(json.loads(self.checker.MANIFEST.read_text())['files']))
        self.assertFalse((self.root / 'addon-workspace.local.json').exists())
    def test_forbidden_distribution_paths(self):
        original = json.loads(self.checker.MANIFEST.read_text())
        for name in ('mnpinner/main.js', 'mnliterature/main.js', 'shared.local.json', '../outside.js', 'plugins/marginnote.extension.mnpinner/main.js', 'MNLiterature.js', '.env.production'):
            updated = dict(original, files=sorted(original['files'] + [name]))
            self.checker.MANIFEST.write_text(json.dumps(updated))
            with self.assertRaisesRegex(ValueError, 'Forbidden publication path'):
                self.checker.check()
    def test_personal_location_is_rejected(self):
        (self.root / 'README.md').write_text('/' + 'Users/example/private')
        with self.assertRaisesRegex(ValueError, 'personal or credential'):
            self.checker.check()
    def test_external_source_link_is_rejected(self):
        path = self.root / 'README.md'
        path.unlink()
        path.symlink_to(ROOT / 'README.md')
        with self.assertRaisesRegex(ValueError, 'regular in-project file'):
            self.checker.check()

if __name__ == '__main__':
    unittest.main()
