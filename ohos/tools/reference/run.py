#!/usr/bin/env python3
import subprocess,sys
from runtime import WORK,dotnet_path,environment
assembly=WORK/'bin/Reference.dll'
if not assembly.is_file():raise SystemExit('Run python3 compile.py first.')
raise SystemExit(subprocess.call([str(dotnet_path()),str(assembly),*sys.argv[1:]],env=environment()))
