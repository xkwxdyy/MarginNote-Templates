#!/usr/bin/env python3
"""Run portable, offline checks; never install addons or contact a service."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
environment = {key: value for key, value in os.environ.items() if key not in ('MNKB_TEST_ROOT', 'MN_READING_TEST_ROOT', 'MN_RESEARCH_TEST_ROOT')}
environment['PYTHONDONTWRITEBYTECODE'] = '1'
commands = [
    [sys.executable, 'tools/check-publication.py'],
    [sys.executable, 'tests/build-test.py'],
    [sys.executable, 'tests/publication-test.py'],
    ['node', 'tests/scene-core-test.js'],
    ['node', 'scene-plugins/reading-scene/tests/plugin-test.js'],
    ['node', 'scene-plugins/reading-scene/tests/native-text-menu-test.js'],
    ['node', 'scene-plugins/reading-scene/tests/titlecase-test.js'],
    ['node', 'scene-plugins/research-scene/tests/plugin-test.js'],
]
for command in commands:
    subprocess.run(command, cwd=ROOT, env=environment, check=True)
print('Portable checks passed. MarginNote device acceptance remains pending.')
