"""Locate an existing official .NET 9 SDK. Never downloads or installs software."""
from pathlib import Path
import os,shutil
BASE=Path(__file__).resolve().parent
WORK=BASE/'.work'
def environment():
 return {**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_SKIP_FIRST_TIME_EXPERIENCE':'1','DOTNET_GENERATE_ASPNET_CERTIFICATE':'false','DOTNET_NOLOGO':'1','DOTNET_CLI_HOME':str(WORK/'dotnet-home')}
def dotnet_path():
 root=os.environ.get('MFP_DOTNET_ROOT')
 path=next((Path(root)/n for n in ['dotnet','dotnet.exe'] if (Path(root)/n).is_file()),None) if root else None
 if path is None:
  found=shutil.which('dotnet');path=Path(found).resolve() if found else None
 if path is None:raise SystemExit('Provide an existing official .NET 9 SDK via MFP_DOTNET_ROOT or PATH. No automatic download is performed.')
 return path.resolve()
def version_key(path):
 return tuple(int(x) for x in path.name.split('-')[0].split('.'))
