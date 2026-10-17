#!/usr/bin/env python3
"""Read-only source ledger/original-registration audit; optional mocked Node gates.
Does not execute original network code, DNS, endpoints, File recording or devices.
Writes nothing unless its stdout is explicitly redirected by the caller.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, subprocess
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SITES = [55, 56, 69, 70, 71, 72, 73, 74, 75, 76, 80, 81, 82]
CANDIDATES = [72, 75, 76, 80, 81, 82]
ORIGINAL = [
 'Source/MultiFunPlayer/OutputTarget/AbstractOutputTarget.cs',
 'Source/MultiFunPlayer/OutputTarget/IOutputTarget.cs',
 'Source/MultiFunPlayer/OutputTarget/IOutputTargetFactory.cs',
 'Source/MultiFunPlayer/UI/Controls/ViewModels/OutputTargetViewModel.cs',
 'Source/MultiFunPlayer/Common/IConnectable.cs',
 'Source/MultiFunPlayer/Common/Extensions.cs',
 'Source/MultiFunPlayer/Common/Utils/NetUtils.cs',
 'Source/MultiFunPlayer/Shortcut/IShortcutManager.cs',
 'Source/MultiFunPlayer/Shortcut/IShortcutSettingBuilder.cs',
 'Source/MultiFunPlayer/UI/Controls/EndPointBox.xaml',
 'Source/MultiFunPlayer/UI/Controls/EndPointBox.xaml.cs',
 'Source/MultiFunPlayer/UI/Controls/UriBox.xaml',
 'Source/MultiFunPlayer/UI/Controls/UriBox.xaml.cs',
 'Source/MultiFunPlayer/UI/Converters/PortToStringConverter.cs',
] + [f'Source/MultiFunPlayer/OutputTarget/{part}/{kind}OutputTarget.{ext}'
 for kind in ['Tcp', 'Udp', 'WebSocket', 'Buttplug', 'Pipe', 'Serial', 'TheHandy', 'File']
 for part, ext in [('ViewModels', 'cs'), ('Views', 'xaml')]]
RUNTIME = [
 'ohos/entry/src/main/ets/output/OutputTargetCollection.ts',
 'ohos/entry/src/main/ets/output/OutputCoordinator.ts',
 'ohos/entry/src/main/ets/output/OutputSession.ts',
 'ohos/entry/src/main/ets/output/OutputSettingsModel.ts',
 'ohos/entry/src/main/ets/output/OutputTypes.ts',
 'ohos/entry/src/main/ets/output/NativeTransportAdmission.ts',
 'ohos/entry/src/main/ets/output/NativeOutputCoordinator.ets',
 'ohos/entry/src/main/ets/app/NativeOutputSession.ets',
 'ohos/entry/src/main/ets/settings/OutputConfiguration.ts',
 'ohos/entry/src/main/ets/components/OutputSettingsPanel.ets',
 'ohos/entry/src/main/ets/pages/Index.ets',
] + [f'ohos/entry/src/main/ets/output/native/{name}.ets' for name in
 ['NativeTransportFactory', 'NativeTcpTransport', 'NativeUdpTransport', 'NativeWebSocketTransport']]
TESTS = [f'ohos/tests/{name}.test.mjs' for name in ['output-target-collection', 'output-coordinator',
 'multi-output-intent', 'multi-output-lifecycle', 'output-native-network']]
def sha(data): return hashlib.sha256(data).hexdigest()
def hashes(paths): return {p: sha((REPO / p).read_bytes()) for p in paths}
def main():
 parser = argparse.ArgumentParser(); parser.add_argument('--run-baseline', action='store_true'); args = parser.parse_args()
 baseline = 'ohos/tools/reference/action-coverage-018-source.json'
 ledger = json.loads((REPO / baseline).read_text())
 rows = [r for r in ledger['original188RegistrationEvidence'] if r['templateIndex'] in SITES]
 assert [r['templateIndex'] for r in rows] == SITES
 for row in rows:
  source = row['source']; raw = (REPO / source['path']).read_bytes(); text = raw.decode('utf-8-sig')
  assert sha(raw) == source['sha256'], source['path']
  assert source['registrationSource'] in text, row['registrationId']
  assert sha(source['registrationSource'].encode()) == source['registrationTextSha256'], row['registrationId']
  coverage = next(r for r in ledger['coverage018Templates'] if r['originalTemplateIndex'] == row['templateIndex'])
  assert coverage['status'] == 'unwired'
 start = datetime.datetime.now(datetime.timezone.utc).isoformat()
 before = hashes(ORIGINAL + RUNTIME + TESTS)
 result = {'auditDateUtc':start, 'scope':'Source/dependency audit and optional existing mocked baseline; no new action implementation or new coverage credit.',
  'retainedOriginalCommit':ledger['sourceCommit'], 'baselineLedger':baseline,
  'baselineLedgerSha256':sha((REPO / baseline).read_bytes()),
  'registrationSiteCount':13, 'recommendedPartialCandidateSites':CANDIDATES,
  'keepUnwiredSites':[s for s in SITES if s not in CANDIDATES],
  'registrationEvidence':rows, 'originalSourceSha256':hashes(ORIGINAL), 'runtimeSourceSha256':hashes(RUNTIME),
  'runnerSha256':sha(Path(__file__).read_bytes()), 'mockBaseline':None}
 if args.run_baseline:
  command = ['node', '--test', *TESTS]
  run = subprocess.run(command, cwd=REPO, capture_output=True, text=True)
  output = run.stdout + run.stderr
  result['mockBaseline'] = {'command':command, 'exitCode':run.returncode,
   'nodeVersion':subprocess.check_output(['node','--version'], text=True).strip(),
   'inputSha256':{p:before[p] for p in RUNTIME+TESTS}, 'outputSha256':sha(output.encode()),
   'summary':[line for line in output.splitlines() if line.startswith('ℹ ')],
   'limitations':'Memory transports, fake native SDK/environment and extracted ArkTS owners. No DNS/network/device/Windows execution.'}
  assert run.returncode == 0, output[-5000:]
 after = hashes(ORIGINAL + RUNTIME + TESTS)
 result['sourceUnchangedDuringAudit'] = before == after
 result['completedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
 assert before == after, 'Concurrent edits invalidated this evidence snapshot; rerun.'
 print(json.dumps(result, indent=2))
if __name__ == '__main__': main()
