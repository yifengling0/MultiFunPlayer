#!/usr/bin/env python3
"""Copy reproducible source only; generated build caches are never source inputs."""
from pathlib import Path
import shutil
import sys

EXCLUDED_COMPONENTS = frozenset({'.git', '.hvigor', '.cxx', 'build', 'node_modules',
    'oh_modules', '.work', '__pycache__', '.tool-home', 'bin', 'obj'})
SOURCE_DIRECTORIES = ('ohos', 'Source', 'Docs', 'Assets', '.github', 'tools')

def included(relative: Path) -> bool:
    return not any(part in EXCLUDED_COMPONENTS for part in relative.parts) and \
        relative.name != 'local.properties' and not relative.name.startswith('.env')

def copy_source(root: Path, destination: Path) -> None:
    if destination.exists():
        raise ValueError('Snapshot destination must not already exist')
    destination.mkdir(parents=True)
    files = [path for path in root.iterdir() if path.is_file()]
    for name in SOURCE_DIRECTORIES:
        directory = root / name
        if directory.is_dir() and not directory.is_symlink():
            files.extend(path for path in directory.rglob('*') if path.is_file())
    for path in sorted(files):
        relative = path.relative_to(root)
        # Never follow a linked file or any linked ancestor into another tree.
        if not included(relative) or path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root and root in parent.parents):
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: source_snapshot.py repository new-destination')
    copy_source(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).absolute())
