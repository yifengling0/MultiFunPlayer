#!/usr/bin/env python3
"""Rebuild the 0.19 source-route ledger from immutable 0.18 and actual source.

No Git, package installation, network, native device or File recording operation.
--run-focused executes only the named Node suites and embedded temporary probes.
Without it, reuse the recorded local focused result only if its exact input hashes
still match. --freeze-utc labels a parent-reported freeze; it never implies an SDK,
aggregate, archive or real-player pass.
"""
from pathlib import Path
import argparse, collections, copy, datetime, hashlib, json, os, re, subprocess

ROOT = Path(__file__).resolve().parents[3]
os.chdir(ROOT)
P = 'ohos/entry/src/main/ets/'
BASE = 'ohos/tools/reference/action-coverage-018-source.json'
OUT = 'ohos/tools/reference/action-coverage-019-source.json'
DOC = 'ohos/ACTION_COVERAGE_019.md'
PROBE = Path('/tmp/mfp-action-coverage-019-probes.test.mjs')
GENERATOR = Path('/tmp/create-mfp-action-probes-019.py')
RESULT = Path('/tmp/mfp-action-coverage-019-result.json')
LOG = Path('/tmp/mfp-action-coverage-019-focused.log')
EDITED = ['input-shortcuts', 'shortcut-setting-actions', 'shortcut-motion-actions',
          'shortcut-point-actions', 'input-motion-ui', 'input-points-ui',
          'input-managed-output-editors-ui', 'input-general-integration']
FOCUSED = EDITED + ['input-extended-ui', 'output-connection-arguments-019',
                   'output-connection-ui-019', 'deovr-control-evidence',
                   'deovr-control-session-019', 'output-control-continuity']
NEW = {72: 'OutputTarget::TCP::Endpoint::Set', 75: 'OutputTarget::UDP::Endpoint::Set',
       76: 'OutputTarget::WebSocket::Uri::Set', 80: 'OutputTarget::Connection::Toggle',
       81: 'OutputTarget::Connection::Connect', 82: 'OutputTarget::Connection::Disconnect'}
MOVES = {
 'await DeoVrSession.current().changeSpeed(speed)': 'await source.changeSpeed(control.speed!, dispatched)',
 'await source.playPause(playing)': "await source.playPause(control.kind === 'play', dispatched)",
 'this.engine.acceptDeoVrSnapshot(snapshot, events)': 'this.engine.acceptDeoVrSnapshot(snapshot, events, this.inputNow())'
}

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def record(p): return {'path': str(p), 'sha256': digest(p), 'hashNormalization': 'raw file bytes'}
def anchor(p, text):
    s = Path(p).read_text()
    assert text in s, (p, text)
    return {'path': p, 'line': s[:s.index(text)].count('\n') + 1, 'symbolOrText': text, 'sourceSha256': digest(p)}
def markers(items): return [anchor(P + p, text) for p, text in items]
def merge(a, b):
    seen = {(x['path'], x['symbolOrText']) for x in a}
    return a + [x for x in b if (x['path'], x['symbolOrText']) not in seen]
def input_paths():
    paths = {str(p) for p in Path(P).rglob('*') if p.suffix in ('.ts', '.ets')}
    paths |= {str(p) for p in Path('ohos/tests').glob('*.mjs')}
    paths |= {str(p) for p in Path('ohos/tools/reference/output-connection-019').glob('*') if p.is_file()}
    paths |= {BASE, 'ohos/tools/reference/action-coverage-017-source.json', str(PROBE)}
    return sorted(paths)

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--run-focused', action='store_true')
ap.add_argument('--freeze-utc', default='not reported')
args = ap.parse_args()
base = json.loads(Path(BASE).read_text())
if not PROBE.exists() or not GENERATOR.exists():
    previous = json.loads(Path(OUT).read_text()) if Path(OUT).exists() else None
    assert previous is not None, 'First run requires the independently prepared temporary action probes.'
    PROBE.write_text(previous['auditProbe']['testSource'])
    GENERATOR.write_text(previous['auditProbe']['generatorSource'])
if args.run_focused:
    before = {p: digest(p) for p in input_paths()}
    command = ['node', '--test', '--test-reporter=tap'] + ['ohos/tests/' + n + '.test.mjs' for n in FOCUSED] + [str(PROBE)]
    env = dict(os.environ); env.pop('MFP_DOTNET_ROOT', None)
    started = now()
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    LOG.write_text(result.stdout)
    def total(key):
        found = re.search(r'^# ' + key + r' (\d+)$', result.stdout, re.M)
        return int(found.group(1)) if found else None
    focus = {'status': 'passed' if result.returncode == 0 else 'failed', 'command': ' '.join(command),
      'startedAtUtc': started, 'completedAtUtc': now(), 'tests': total('tests'), 'passed': total('pass'),
      'failed': total('fail'), 'skipped': total('skipped'), 'cancelled': total('cancelled'),
      'exitCode': result.returncode, 'inputSha256': before,
      'inputsUnchangedDuringRun': all(digest(p) == sha for p, sha in before.items()),
      'outputSha256': digest(LOG), 'localLogPath': str(LOG),
      'nodeVersion': subprocess.check_output(['node', '--version'], text=True).strip(),
      'dotnetRerun': False, 'optionalDotnetBranchReason': 'MFP_DOTNET_ROOT explicitly unset for this audit subprocess',
      'scope': '14 named Node suites and 12 independent temporary action probes; memory/native mocks and extracted Index/panel/output controllers. No release aggregate, SDK, network endpoint, File recording or physical device.'}
    RESULT.write_text(json.dumps(focus, indent=2) + '\n')
else:
    focus = json.loads(RESULT.read_text()) if RESULT.exists() else {'status': 'not_run'}
if args.freeze_utc != 'not reported':
    assert focus['status'] == 'passed' and focus['inputsUnchangedDuringRun'], focus.get('status')
    assert all(digest(p) == sha for p, sha in focus['inputSha256'].items()), 'Focused inputs changed; rerun the named suites.'
if focus.get('inputSha256'):
    focus['inputsStillMatchAtSnapshot'] = all(digest(p) == sha for p, sha in focus['inputSha256'].items())

run = subprocess.run(['node', '--input-type=module', '-e',
  "import {shortcutActionCatalog} from './ohos/entry/src/main/ets/input/ShortcutConfiguration.ts';console.log(JSON.stringify(shortcutActionCatalog()));"], capture_output=True, text=True, check=True)
catalog = json.loads(run.stdout); byid = {s['id']: s for s in catalog}
assert len(catalog) == len(byid) == 178
old = base['candidate018']['catalog']; assert len(old) == 172
for spec in old: assert byid[spec['id']] == spec, (spec['id'], 'inherited spec changed')
added = [s['id'] for s in catalog if s['id'] not in {x['id'] for x in old}]
assert set(added) == set(NEW.values())
concrete = [s for s in catalog if s['originalName'] and not s['originalName'].startswith('{')]
aliases = [s for s in catalog if s['originalName'].startswith('{')]
apps = [s for s in catalog if not s['originalName']]
assert (len(concrete), len(aliases), len(apps)) == (160, 14, 4)

sources = copy.deepcopy(base['originalSources'])
for item in sources: assert digest(item['path']) == item['sha256'], item['path']
source_audit_path = 'ohos/tools/reference/output-connection-019/source.json'
output_audit = json.loads(Path(source_audit_path).read_text())
known = {s['path'] for s in sources}
for path, sha in output_audit['originalSourceSha256'].items():
    assert digest(path) == sha, path
    if path not in known: sources.append(record(path)); known.add(path)
reg = copy.deepcopy(base['original188RegistrationEvidence'])
for row in reg:
    s = row['source']; text = Path(s['path']).read_text()
    assert digest(s['path']) == s['sha256']
    assert s['registrationSource'] in text
    assert text[:text.index(s['registrationSource'])].count('\n') + 1 == s['lineStart']
    assert ''.join(s['callbackSource'].split()) in ''.join(s['registrationSource'].split())
    assert hashlib.sha256(s['registrationSource'].encode()).hexdigest() == s['registrationTextSha256']
    assert hashlib.sha256(''.join(s['callbackSource'].split()).encode()).hexdigest() == s['callbackWhitespaceNormalizedSha256']
    row['reverified019'] = True
census = []
for p in sorted(Path('Source/MultiFunPlayer').rglob('*.cs')):
    text = p.read_text()
    for m in re.finditer(r'\.RegisterAction(?:<[^\n;]+?>)?\s*\(\s*(\$?"[^"\n]*")', text):
        census.append({'path': str(p), 'line': text[:m.start()].count('\n') + 1, 'nameExpression': m.group(1)})
assert len(census) == 188
assert {(c['path'], c['line'], c['nameExpression']) for c in census} == {(r['source']['path'], r['source']['lineStart'], r['nameExpression']) for r in reg}

common = markers([
 ('pages/Index.ets', 'async touchShortcut(action:'), ('pages/Index.ets', 'async runShortcutDispatch(dispatch:'),
 ('pages/Index.ets', 'private async performShortcutDispatch(dispatch:'), ('pages/Index.ets', 'async executeShortcutAction(rawAction:'),
 ('pages/Index.ets', 'this.shortcutProfiles.get(dispatch) !== this.engine.activeRegistry().revision'),
 ('pages/Index.ets', 'this.shortcutOutputOwners.set(dispatch, owners)'),
 ('pages/Index.ets', 'if (spec.targetOutput && !spec.targetAxis)'),
 ('pages/Index.ets', 'private async executeOutputConnectionAction('),
 ('pages/Index.ets', 'this.shortcutOutputOwners.get(dispatch)?.get(id)'),
 ('input/ShortcutConfiguration.ts', 'function appendOutputConnectionActions('),
 ('input/ShortcutConfiguration.ts', 'export function cloneShortcutAction('),
 ('input/ShortcutConfiguration.ts', 'function checkAction('),
 ('input/LocalShortcutEngine.ts', 'dispatchAction(action:'), ('input/LocalShortcutEngine.ts', 'isDispatchCurrent(dispatch:'),
 ('components/InputSettingsPanel.ets', 'private actionRow('), ('components/InputSettingsPanel.ets', 'private actionOptions('),
 ('components/InputSettingsPanel.ets', 'onClick(this.touchActionHandler())'),
 ('components/InputSettingsPanel.ets', 'private executionNote('),
 ('app/NativeOutputSession.ets', 'static matchesTarget('), ('output/OutputTargetCollection.ts', 'isRemoving(')
])
endpoint = markers([
 ('pages/Index.ets', 'const result = applyOutputEndpointAction(draft, action)'),
 ('pages/Index.ets', 'if (!result.changed)'),
 ('pages/Index.ets', 'if (!NativeOutputSession.saveDraft(result.draft) || NativeOutputSession.draftDiagnostic(id).length > 0)'),
 ('pages/Index.ets', 'this.persistOutputPreferences(); this.syncOutput();'),
 ('input/ShortcutOutputConnectionActions.ts', 'export function applyOutputEndpointAction('),
 ('input/ShortcutOutputConnectionActions.ts', 'function validDraftShape('),
 ('input/ShortcutOutputConnectionActions.ts', 'function setEndpoint('),
 ('input/ShortcutOutputConnectionActions.ts', 'function setUri('),
 ('input/ShortcutOutputConnectionActions.ts', 'export function validateOutputConnectionDraft('),
 ('input/ShortcutOutputConnectionActions.ts', 'next.applicationId = 0; next.editRevision++;'),
 ('media/deovr/DeoVrScriptMatch.ts', 'export function parseDeoVrEndpointText('),
 ('settings/OutputConfiguration.ts', 'static validateTarget('),
 ('app/NativeOutputSession.ets', 'static saveDraft('), ('app/NativeOutputSession.ets', 'private static savedDraft('),
 ('output/OutputCoordinator.ts', 'disarm():'), ('output/OutputCoordinator.ts', 'private cancelConnect():'),
 ('output/OutputSession.ts', 'disarm():')
])
connection = markers([
 ('pages/Index.ets', 'const operation = outputConnectionOperation(action.id)'),
 ('pages/Index.ets', "if (operation === 'Connect' && connected)"),
 ('pages/Index.ets', 'target.disarm(); const closing = target.disconnect();'),
 ('pages/Index.ets', 'const request = target.connectOwned(configuration, endpoint)'),
 ('pages/Index.ets', 'new ShortcutConnectionOwner(target, request.requestId)'),
 ('pages/Index.ets', 'target.cancelOwnedConnection(request.requestId)'),
 ('pages/Index.ets', 'target.releaseOwnedConnection(request.requestId)'),
 ('pages/Index.ets', 'entry[1].coordinator.cancelOwnedConnection(entry[1].requestId)'),
 ('input/ShortcutOutputConnectionActions.ts', 'export function outputConnectionOperation('),
 ('app/NativeOutputSession.ets', 'static canConnect('),
 ('output/OutputCoordinator.ts', 'connectOwned(config:'), ('output/OutputCoordinator.ts', 'cancelOwnedConnection(requestId:'),
 ('output/OutputCoordinator.ts', 'private async connectInternal('), ('output/OutputCoordinator.ts', 'private connectIsCurrent('),
 ('output/OutputCoordinator.ts', 'releaseNativeTransport(this.transport)'),
 ('output/OutputSession.ts', 'private async closeConnection('),
 ('output/OutputTargetCollection.ts', 'private async removeEntry('),
 ('output/native/NativeTransportFactory.ets', 'createTcp('),
 ('output/native/NativeTransportFactory.ets', 'createUdp('),
 ('output/native/NativeTransportFactory.ets', 'createWebSocket('),
 ('output/native/NativeTcpTransport.ets', 'export abstract class NativeTransportBase')
])
continuity = markers([
 ('pages/Index.ets', 'private async controlDeoVr('),
 ('pages/Index.ets', 'this.engine.beginDeoVrControl(control, initial, this.inputNow())'),
 ('pages/Index.ets', 'this.output.beginSourceControl()'),
 ('pages/Index.ets', 'this.engine.bindDeoVrControl(lease.requestId, boundary, this.inputNow())'),
 ('core/PlaybackSessionCore.ts', 'beginDeoVrControl('), ('core/PlaybackSessionCore.ts', 'bindDeoVrControl('),
 ('core/PlaybackSessionCore.ts', 'cancelDeoVrControl('),
 ('output/OutputCoordinator.ts', 'beginSourceControl():'),
 ('output/OutputControlContinuity.ts', 'export interface OutputControlLease')
])
endpoint_limits = [
 {'kind': 'normalized_instance_alias_and_bounded_domain', 'description': 'This is a normalized instance-template alias, not an original TCP/0, UDP/0 or WebSocket/0 literal name. It requires one explicit existing target ID and captured process-local generation, with no selected-target fallback. TCP/UDP text is at most 280 UTF-16 units; WebSocket text is at most 1300. Raw DNS/IPv4/IPv6 hosts and ports 1..65535 are bounded and strictly validated. Optional original family prefixes never bypass host validation; host case is normalized and transport family is derived from the host. Original port zero, broad prefixed hosts, parser exceptions and arbitrary absolute URI inputs are not equivalent.'},
 {'kind': 'websocket_uri_and_configuration_domain', 'description': 'WebSocket permits credential-free ws/wss only, defaulting absent ports to 80/443. User-info, query, fragment, escapes, secret-like paths and unsupported schemes are rejected by complete output-configuration validation. Alternate IPv6 compression and path dot-segment normalization are not System.Uri equivalence. Full draft validation preserves ranges, pause permissions, update policy and UDP localPort; malformed/extra draft and action fields are rejected.'},
 {'kind': 'live_endpoint_safety_and_persistence', 'description': 'An unchanged canonical endpoint is inert, preserving connection and existing Arm. A changed validated endpoint synchronously disarms this owner/cancels its pending Connect, clears applicationId, increments editRevision and saves inert preferences. An already-open socket retains its old destination until explicit disconnect/reconnect or configuration Apply. No auto-reconnect or Arm follows. Failed persistence reports a diagnostic; close faults and quarantined native owners remain reserved. Original connected setters mutate a property without this mandatory disarm. WPF/Fody binding order, Windows behavior, actual network endpoints and physical timing remain unexecuted.'}
]
connection_limits = [
 {'kind': 'partial_original_target_expansion', 'description': 'One normalized alias covers one original shared registration site, not one site per target instance or protocol. Only TCP, UDP and WebSocket target owners are supported out of the original eight classes. Serial, Pipe, File, The Handy and Buttplug.io remain absent; this earns no AutoConnect, discovery, authenticated API, serial/named-pipe or recording coverage.'},
 {'kind': 'explicit_owner_and_safety_contract', 'description': 'Foreground/view, writable settings, exact ID/generation/profile/draft and current shortcut leases are required. Current connected Connect and clean disconnected Disconnect are inert. Busy/transitioning operations return without queuing a second transition, unlike the original semaphore wait; faults or unconfirmed closure block replacement. New Connect uses the actual connectOwned/native admission/confirmed-close chain and never Arms. Cancellation retains the exact request ID so an old completion cannot close a newer manual owner. Disconnect synchronously disarms its exact target, then requires close confirmation. Target removal and failed native closure preserve tombstones/quarantine.'},
 {'kind': 'platform_and_protocol_limits', 'description': 'Original connection starts physical streaming and Sync immediately; the portable explicit Arm and source/frame gates are deliberate differences. UDP readiness proves a local transport only, not peer/device execution, and original incoming UDP TCode parsing is absent. Selection does not transfer owner authority. Shared manual-preview terminal safety can revoke other manual-preview targets, while independent media ownership remains separate. Original WPF/Fody/Windows scheduling and actual remote-device timing are unexecuted.'}
]
rows = copy.deepcopy(base['coverage018Templates'])
old_markers = {(a['path'], a['symbolOrText']) for r in rows for a in r['handlerAndDependencyEvidence']}
relocations = []
for r in rows:
    r['original018Status'] = r['status']
    updated = []
    for a in r['handlerAndDependencyEvidence']:
        text = MOVES.get(a['symbolOrText'], a['symbolOrText'])
        updated.append(anchor(a['path'], text))
        if text != a['symbolOrText']:
            relocation = {'path': a['path'], 'previousSymbolOrText': a['symbolOrText'], 'currentSymbolOrText': text}
            if relocation not in relocations: relocations.append(relocation)
    r['handlerAndDependencyEvidence'] = updated
    r['coverage019Transition'] = 'unchanged_from_018'
    r['validationState'] = 'source_route_snapshot_and_named_focused_node_checks_not_release_or_device_acceptance'
    r['catalogSpecs'] = [byid[id] for id in r['exposedNames']]
    r['catalogEvidence']['catalogSource'] = record(P + 'input/ShortcutConfiguration.ts')
    i = r['originalTemplateIndex']
    if i in NEW:
        id = NEW[i]; spec = byid[id]
        assert r['status'] == 'unwired' and spec['originalName'] == r['template']
        assert spec['targetOutput'] and not spec['targetAxis'] and spec['category'] == 'output'
        assert spec['valueKind'] == ('text' if i < 80 else 'none')
        audit_reg = next(x for x in output_audit['registrationEvidence'] if x['templateIndex'] == i)
        assert audit_reg['source']['path'] == r['originalSource']['path']
        assert audit_reg['source']['registrationSource'] == reg[i-1]['source']['registrationSource']
        r['status'] = 'partial'; r['coverage019Transition'] = 'unwired_to_partial_actual_catalog_dispatch_and_owner_route'
        r.pop('unwiredReason', None); r.pop('absenceEvidence', None)
        r['exposedNames'] = [id]; r['exposedConcreteNames'] = []; r['normalizedTemplateAliases'] = [id]; r['catalogSpecs'] = [spec]
        r['catalogEvidence'] = {'runtimeEvaluated': True, 'mappedCatalogIds': [id], 'mappingKind': 'normalized_original_instance_template_alias',
          'catalogSource': record(P + 'input/ShortcutConfiguration.ts'), 'unambiguousSourceSite': r['registrationId'],
          'sameTemplateTextInAnotherClassIsNotCoverage': True}
        r['handlerAndDependencyEvidence'] = merge(common, endpoint if i < 80 else connection)
        r['limitations'] = copy.deepcopy(endpoint_limits if i < 80 else connection_limits)
        r['focusedEvidence'] = ['output-connection-arguments-019.test.mjs', 'output-connection-ui-019.test.mjs', '12 independent embedded actual touch/keyboard action probes']
        r['editorOrTargetAdaptations'] = ['Both keyboard and touch expose the same 14-ID output category, with the six new aliases requiring an explicit output target and rejecting targetAxis/extra numeric/points/runtime authority.', 'Saved target selection and endpoint text grant neither a connection nor Arm; runtime generation is captured on dispatch, never trusted from serialized data.']
        r['wpfBindingEffectChains'] = ['Original instance registration -> target setter or OutputTargetViewModel semaphore -> actual backend is preserved in OUTPUT_CONNECTION_019_SOURCE_AUDIT.md and the 30 original dependent source hashes. WPF/Fody control execution is not claimed.']
    if i in (83, 84, 86, 87):
        r['handlerAndDependencyEvidence'] = merge(r['handlerAndDependencyEvidence'], continuity)
        r['continuity019Caveat'] = 'Ordinary DeoVR controls may retain existing target-bound Arm only through two eligible subsequent observations and a newer fully validated frame; this is not remote acknowledgement, automatic Arm, or a promotion of original-domain coverage. Seek and Path still disarm.'
    if i not in NEW:
        assert r['status'] == r['original018Status']
        assert r['limitations'] == base['coverage018Templates'][i-1]['limitations']
        assert r['catalogSpecs'] == base['coverage018Templates'][i-1]['catalogSpecs']

for spec in concrete:
    matches = [r for r in rows if spec['id'] in r['exposedConcreteNames']]
    assert len(matches) == 1 and spec['id'] in matches[0]['knownConcreteNames'], spec['id']
for spec in aliases:
    matches = [r for r in rows if spec['id'] in r['normalizedTemplateAliases']]
    assert len(matches) == 1 and spec['originalName'] == matches[0]['template'], spec['id']
# Aliases sharing Endpoint template text are intentionally assigned by class/site,
# never matched to Buttplug's visually identical original registration.
assert rows[68]['status'] == 'unwired' and not rows[68]['exposedNames']
counts = dict(collections.Counter(r['status'] for r in rows))
assert counts == {'unwired': 35, 'partial': 43, 'full_within_portable_contract': 110}
exposed = sum(bool(r['exposedNames']) for r in rows); assert exposed == 153
assert sum(len(r['exposedNames']) for r in rows) == 174
remaining = [copy.deepcopy(r) for r in base['remaining041'] if r['originalTemplateIndex'] not in NEW]
assert len(remaining) == 35
feature_groups = {}
for k, group in base['remainingFeatureGroups'].items():
    ids = [i for i in group['indices'] if i not in NEW]
    feature_groups[k] = {'title': group['title'], 'indices': ids, 'count': len(ids)}
family = {}
for name in sorted({r['family'] for r in rows}):
    rs = [r for r in rows if r['family'] == name]
    family[name] = {'templates': len(rs), 'fullWithinPortableContract': sum(r['status'] == 'full_within_portable_contract' for r in rs), 'partial': sum(r['status'] == 'partial' for r in rs), 'unwired': sum(r['status'] == 'unwired' for r in rs), 'exposedOriginalConcreteNames': sum(len(r['exposedConcreteNames']) for r in rs), 'normalizedTemplateAliases': sum(len(r['normalizedTemplateAliases']) for r in rs)}
all_markers = {(a['path'], a['symbolOrText']) for r in rows for a in r['handlerAndDependencyEvidence']}
golden_path = 'ohos/tools/reference/output-connection-019/endpoint-golden.json'
golden = json.loads(Path(golden_path).read_text())
for path, sha in golden['provenance']['sourceSha256'].items(): assert digest(path) == sha
snapshot = [record(p) for p in input_paths()]
timestamp = now()
audit = {'schemaVersion': 5, 'auditDateUtc': timestamp[:10], 'sourceCommit': base['sourceCommit'],
 'sourceCommitEvidence': 'Retained original identifier; no Git command. All inherited original hashes, output dependency hashes, 188 exact registration/callback records and independent literal registration census reverified.',
 'scope': 'Current source-route snapshot with named focused Node execution, not final aggregate/SDK/HAP/archive/Windows/WPF/Fody/real-player/native-device/physical-output acceptance.',
 'baseline018': {'ledger': record(BASE), 'document': record('ohos/ACTION_COVERAGE_018.md'), 'status': 'immutable historical evidence, not edited'},
 'candidate019': {'status': 'post_reported_freeze_snapshot' if args.freeze_utc != 'not reported' else 'provisional_while_independent_review_continues',
   'auditedAtUtc': timestamp, 'productionFreezeReportedAtUtc': args.freeze_utc, 'catalogRuntimeEvaluated': True,
   'catalogCount': len(catalog), 'concreteOriginalNames': len(concrete), 'normalizedOriginalTemplateAliases': len(aliases), 'ohosAdditionCount': len(apps), 'ohosAdditions': [s['id'] for s in apps],
   'originalRegistrationTemplatesExposed': exposed, 'originalRegistrationTemplateDenominator': 188, 'counts': counts,
   'concreteCountsByTemplateStatus': {s: sum(len(r['exposedConcreteNames']) for r in rows if r['status'] == s) for s in counts},
   'templateAliasCountsByTemplateStatus': {s: sum(len(r['normalizedTemplateAliases']) for r in rows if r['status'] == s) for s in counts},
   'familyCounts': family, 'newCatalogIds': added, 'newlyWiredOriginalTemplateIndices': list(NEW),
   'inheritedPartialTemplates': 37, 'inheritedPartialPromotions': [], 'inheritedCatalogFieldsUnchanged': 172,
   'allOriginalConcreteAndAliasMappingsExactlyOnce': True, 'catalogOnlyMatchesAccepted': False,
   'inheritedUniqueRowRuntimeAnchors': len(old_markers), 'inheritedSemanticMarkerReplacements': relocations,
   'uniqueCurrentRowRuntimeAnchors': len(all_markers),
   'definition': 'Site counts refer to exact original RegisterAction call sites. Dynamic target instance IDs and class expansions do not multiply a shared registration. Full-portable uses the unchanged baseline safety/domain scope.',
   'catalog': catalog, 'catalogCanonicalSha256': hashlib.sha256(json.dumps(catalog, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
   'runtimeAndTestSnapshot': snapshot,
   'snapshotCaveat': 'Later code/test edits invalidate affected markers and execution inputs. Memory mocks/extracted controllers do not execute ArkUI rendering, native sockets or physical devices.',
   'productionFilesEditedByCoverageAudit': False, 'final019AggregateClaimed': False, 'final019SdkBuildClaimed': False, 'windowsExecuted': False, 'hardwareConnected': False},
 'originalSources': sources, 'original188RegistrationEvidence': reg, 'independentLiteralRegistrationCensus': census,
 'coverage019Templates': rows, 'remaining035': remaining, 'remainingFeatureGroups': feature_groups,
 'inheritedBoundaries': {k: copy.deepcopy(base[k]) for k in ['deovrBoundary', 'managedLoopingBoundary', 'outputRangeBoundary']},
 'outputEndpointBoundary': endpoint_limits, 'outputConnectionBoundary': connection_limits,
 'continuity019Boundary': {'newShortcutIds': [], 'coveragePromotions': [], 'eligibleOrdinaryControls': ['Play', 'Pause', 'Speed'],
    'canCreateArm': False, 'remoteAcknowledgement': False, 'serverTimestamp': False,
    'scope': 'Current owner may retain its already-explicit Arm only across eligible same-source observations and a newer real validated frame; unresolved/superseded/stale/faulted state closes candidates. Seek, Path and resource changes still revoke Arm. Locally coherent buffered server samples remain indistinguishable from fresh server samples.',
    'sourceRouteEvidence': continuity, 'independentContinuityReviewIsSeparate': True},
 'originalEndpointOracle': {'fixture': record(golden_path), 'rows': len(golden['rows']), 'provenance': golden['provenance'],
    'comparedByNamedNodeSuite': True, 'freshDotnetRerunByCoverageAudit': False, 'notConnectionOrWpfExecution': True},
 'focusedExecution': focus,
 'verification': {'originalInheritedSourceFilesVerified': len(base['originalSources']), 'originalSourceFilesIncludingOutputAudit': len(sources),
    'outputOriginalDependencyHashesVerified': len(output_audit['originalSourceSha256']), 'originalRegistrationBodiesVerified': 188,
    'callbackWhitespaceNormalizedInclusionVerified': 188, 'independentLiteralRegistrationCensusCount': len(census),
    'newPartialRows': list(NEW), 'oldPartialStatusAndLimitationsPreserved': True, 'inheritedCatalogSpecsUnchanged': 172,
    'productionFilesEdited': False, 'existingDocumentsEdited': False, 'repositoryTestsAdded': False,
    'existingRepositoryTestsEdited': len(EDITED), 'editedTestPaths': ['ohos/tests/' + n + '.test.mjs' for n in EDITED],
    'testChangePurpose': 'Exact 178-ID accounting, six explicit source aliases/routes, full inherited172 spec equality and range-only targetAxis assumptions. Prior rejection cases retained.',
    'gitOperationsPerformed': False, 'networkOrDeviceOperationsPerformed': False, 'fileRecordingBehaviorReviewed': False},
 'evidenceDocuments': [record(p) for p in ['ohos/OUTPUT_CONNECTION_019_SOURCE_AUDIT.md', source_audit_path, 'ohos/DEOVR_019_CONTINUITY_CONTRACT.md', 'ohos/DEOVR_019_CONTRACT_REVIEW.md']],
 'auditor': record('ohos/tools/reference/audit_action_coverage_019.py'),
 'auditProbe': {'generatorPath': str(GENERATOR), 'generatorSha256': digest(GENERATOR), 'generatorSource': GENERATOR.read_text(),
    'testPath': str(PROBE), 'testSha256': digest(PROBE), 'testSource': PROBE.read_text(),
    'scope': '12 independent temporary cases import/extract actual Index, keyboard engine and output owner. All six aliases are executed through actual touch and keyboard, with all three protocol kinds, idempotence, explicit target routing and live/no-op endpoint semantics. Only MemoryTransport, fake clock and native mocks; no external IO.'}}

# A human-readable current matrix, retaining every original and partial row.
def clean(s): return str(s).replace('|', '\\|').replace('\n', ' ')
def link(path, line):
    url = path[5:] if path.startswith('ohos/') else '../' + path
    return '[' + Path(path).name + ':' + str(line) + '](' + url + '#L' + str(line) + ')'
parts = [f'''# 0.19 original shortcut action coverage

Source-route snapshot: **{timestamp}**. Production freeze reported: **{args.freeze_utc}**. Retained original: `{base['sourceCommit']}`. Immutable baseline: [0.18 matrix](ACTION_COVERAGE_018.md) and [0.18 source ledger](tools/reference/action-coverage-018-source.json).

This document and its [machine-readable ledger](tools/reference/action-coverage-019-source.json) audit the actual catalog, original callbacks and current main Index routes. They are **not final release aggregate, SDK/HAP, archive, Windows/WPF/Fody, actual network/player or physical-device acceptance**. Later source/test edits invalidate affected evidence. The [reproducible auditor](tools/reference/audit_action_coverage_019.py) can recheck all source, mapping and focused-execution hashes. No production, prior document, Git, File recording or external network state was changed by this coverage audit.

## Exact accounting

**178 unique IDs = 160 original concrete names + 14 normalized original-template aliases + 4 OHOS extensions.** They map to **153 of 188 original registration call sites**. The six added endpoint/connection names are aliases, including TCP and UDP Endpoint. Their shared Endpoint template text does not also map to the unwired Buttplug registration.

| Classification | Original sites | Concrete names | Aliases |
|---|---:|---:|---:|
| Full within the unchanged portable contract | 110 | 116 | 0 |
| Partial original domain/dependency/platform coverage | 43 | 44 | 14 |
| Unwired | 35 | 0 | 0 |
| Total | 188 | 160 | 14 |

All **172 inherited catalog specs are byte-for-field equivalent** after JSON serialization; all **37 inherited partial classifications and limitations are retained**, and no prior status is promoted. Only sites **72, 75, 76, 80, 81 and 82** transition from unwired to partial. The four extensions remain App::Stop, App::Internal::Random, App::Fullscreen::Toggle and App::Library::Show. Original shared connection registrations count once regardless of target class, instance count, editor row or repeated invocation.

## Six new aliases and actual source-to-owner routes

| Site | Alias | Exact original owner/callback | Current route |
|---:|---|---|---|
| 72 | `OutputTarget::TCP::Endpoint::Set` | TcpOutputTarget, `NetUtils.TryParseEndpoint` then property assignment | Index → applyOutputEndpointAction → full candidate validation → exact owner disarm → saveDraft / preferences |
| 75 | `OutputTarget::UDP::Endpoint::Set` | UdpOutputTarget, same helper but distinct source call site | Same route, restricted to an existing UDP target; localPort and all unrelated settings preserved |
| 76 | `OutputTarget::WebSocket::Uri::Set` | WebSocketOutputTarget, `Uri.TryCreate(...Absolute...)` then property assignment | Same route, bounded ws/wss parser and full saved-config validator |
| 80 | `OutputTarget::Connection::Toggle` | OutputTargetViewModel closure → per-target semaphore → state-based connect/disconnect | Captured ID/generation → exact coordinator's current state → connectOwned or confirmed disconnect |
| 81 | `OutputTarget::Connection::Connect` | Same host, only Disconnected → manual ConnectAsync | Healthy connected guard is inert; otherwise validated draft → connectOwned → exact request/instance/profile/edit checks |
| 82 | `OutputTarget::Connection::Disconnect` | Same host, only Connected → DisconnectAsync | Exact target disarm → disconnect → close confirmation; no selected-target fallback |

All six are present in both keyboard and touch editors. The **20 groups expose all 178 IDs exactly once**; the output group has **14**, comprising eight existing range aliases and these six. The new aliases require explicit outputTargetId and reject axis, points, undeclared numeric fields and serialized runtime authority. Keyboard and touch share the ordered dispatcher, profile/target generation capture and owner-cancellation path. No saved text itself connects or Arms anything.

### Endpoint and live-edit boundary

TCP/UDP text is bounded to 280 UTF-16 units and WebSocket to 1300. Hosts are bounded DNS/IPv4/IPv6 and ports are 1..65535. Family prefixes are accepted as source text only; they cannot bypass host validation. WebSocket is credential-free ws/wss with explicit normalization to ports 80/443 when omitted. User-info, query, fragment, escapes, unsupported schemes and secret-like paths are refused. Full candidate validation includes ranges, pause permissions, update interval and retained UDP localPort before mutation.

A canonical-equal endpoint succeeds inertly. A changed endpoint clears applicationId, increments editRevision, synchronously disarms its exact target/cancels pending Connect and persists an inert draft. The already-open old socket remains bound to its old destination. Repeated Connect while it is still healthy/connected neither replaces that socket nor reapplies the draft nor restores Arm. Explicit disconnect/reconnect or configuration Apply is required. Invalid input is atomic; failed persistence is not reported as a successful save. Native-close quarantine is never released merely because new text was saved.

This differs deliberately from the original connected property-only setters, which do not disarm. Original parser port zero/prefix bypass, unbounded strings, possible thrown TryParse exceptions, arbitrary absolute URI schemes and System.Uri path/IP normalization remain outside the portable domain. The [original dependent-chain audit](OUTPUT_CONNECTION_019_SOURCE_AUDIT.md) includes exact setters, host lifecycle, WPF disabled editors, binding converters and transport ownership; it is not WPF execution.

### Connection and platform boundary

Only TCP, UDP and WebSocket owners participate. Serial, Pipe, File, The Handy and Buttplug.io remain absent. Busy transitions are inert rather than queued behind the original semaphore; fault/unconfirmed close blocks replacement. Owned requests guard cancellation so an obsolete shortcut cannot close a newer manual connection. Remove/re-add requires the captured process-local generation; close-fault tombstones and quarantined handles remain reserved. New connections never Arm or start media playback.

UDP ready means a local transport exists, without proof of a peer/device, and original reverse incoming-TCode handling remains absent. Shared manual-preview terminal safety can invalidate other manual-preview targets; complete target isolation is not claimed for that shared authorization. Native Windows/WPF/Fody timing, actual OHOS sockets, physical timing and device execution remain separate gates.

### Existing DeoVR controls in this snapshot

Play/Pause/Speed add no IDs and promote no original status. Current Index uses controlDeoVr and actual dispatch-boundary/observation/core/output routes. Eligible ordinary controls may retain only an already explicit target-bound Arm while candidates are suspended, then require two compatible subsequent ingress observations and a genuinely newer validated frame. This is **not a remote ACK or proof of server sample freshness**; local write success is not permission. Stale/error/overlap/resource/profile/scope changes revoke retention. Seek, Path, AB and automatic skipping continue to disarm. See the separate [continuity contract](DEOVR_019_CONTINUITY_CONTRACT.md) and [independent contract review](DEOVR_019_CONTRACT_REVIEW.md); their design acceptance is not production or device acceptance.

Three inherited Index text anchors were replaced by current semantic counterparts; the ledger records each old/new marker. All other inherited markers were relocated against current raw file hashes. All previous partial reasons, including managed scripts, source adapter coverage, bounded speed/name domains, provider/range/WPF effects, remain unchanged.

## Verification and limits

- Executed the actual catalog and checked all 172 inherited specs and exactly six additions. Every original-derived ID maps exactly once, with explicit class/site mapping for the duplicate Endpoint template.
- Reverified **{len(base['originalSources'])} inherited original source hashes**, **{len(output_audit['originalSourceSha256'])} output-dependent hash records**, **{len(sources)} distinct original files**, **188 exact registration/callback records**, and an independent **188-site literal source census**.
- Rechecked **{len(old_markers)} inherited unique markers**, including three documented semantic replacements. The current ledger records **{len(all_markers)} unique route markers**, line/text and full raw-byte file hashes.
- Named focused execution: **{focus.get('tests', 'not run')} tests; {focus.get('passed', 'not run')} passed, {focus.get('failed', 'not run')} failed, {focus.get('skipped', 'not run')} skipped**. This is 14 named Node suites plus 12 independent temporary probes. Complete command, times, input/output hashes and reconstructable probe/generator sources are embedded in the ledger.
- Independent probes execute every new alias through actual touch and keyboard dispatch: three protocol kinds, disconnected Disconnect, idempotent connected Connect without losing existing Arm, both Toggle directions, explicit target amid another selected target, no-op/changed endpoint, retained old socket and required later reapplication. All transports/native platform APIs are memory mocks; controllers are extracted from actual production.
- The named argument suite checks **124 retained original C# endpoint/parser rows** against admitted portable semantics or explicit rejection, including the documented path-normalization difference. It verifies generated-host/extraction/source hashes. This coverage audit did not rerun .NET; MFP_DOTNET_ROOT was explicitly unset for the focused subprocess, so its optional fresh-.NET test returns without execution.
- Exactly eight assigned existing tests were updated for counts, source mappings and the six non-axis output aliases. All previous rejection cases remain. No production, reviewer test, library-ui-flow harness, existing document or Git write was made by this audit.

No final aggregate, SDK/HAP build, packaging/archive, actual Download grant, ArkUI rendering/native keyboard, Windows/WPF/Fody, File recording, real endpoint/player or physical device is established by these checks.

## Remaining 35 unwired original sites

| Capability | Original indices | Count |
|---|---|---:|
''']
for group in feature_groups.values():
    parts.append('| ' + group['title'] + ' | ' + ', '.join(map(str, group['indices'])) + ' | ' + str(group['count']) + ' |\n')
parts.append('''
The historical [0.17 dependency inventory](REMAINING_ORIGINAL_DEPENDENCIES_017.md) is preserved as evidence. The remaining output rows are AutoConnect Set/Toggle, Buttplug endpoint, Pipe name, Serial device ID and The Handy key/source axis. Ordinary manual UI, protocol resemblance or a saved setting does not earn shortcut coverage.

## All 43 partial rows and retained limitations

| # | Original template | Remaining boundary |
|---:|---|---|
''')
for r in rows:
    if r['status'] == 'partial':
        parts.append('| ' + str(r['originalTemplateIndex']) + ' | `' + clean(r['template']) + '` | ' + clean(' '.join(x['description'] for x in r['limitations'])) + ' |\n')
parts.append('''
## Complete 188-row source/route matrix

F = full within the unchanged declared portable contract; P = partial; U = unwired. C/A counts concrete names and normalized aliases. Raw-file SHA-256 prefixes accompany original and current source links; complete hashes, callbacks, parameters, all dependent markers and limitations are in the JSON. An inherited F is not unrestricted original application/backend parity.

| # | Original template | Status | C / A | Original source · SHA-256 | Current route · SHA-256 / missing dependency |
|---:|---|:---:|---:|---|---|
''')
for r in rows:
    src = r['originalSource']; a = r['handlerAndDependencyEvidence']
    original = link(src['path'], src['lineStart']) + ' · `' + src['sha256'][:12] + '`'
    if a:
        chosen = next((x for x in a if x['symbolOrText'] == 'private async executeOutputConnectionAction('), a[0])
        current = link(chosen['path'], chosen['line']) + ' · `' + chosen['sourceSha256'][:12] + '`'
    else: current = clean(r['unwiredReason'])
    parts.append('| ' + str(r['originalTemplateIndex']) + ' | `' + clean(r['template']) + '` | ' + {'partial': 'P', 'unwired': 'U', 'full_within_portable_contract': 'F'}[r['status']] + ' | ' + str(len(r['exposedConcreteNames'])) + ' / ' + str(len(r['normalizedTemplateAliases'])) + ' | ' + original + ' | ' + current + ' |\n')
Path(DOC).write_text(''.join(parts))
audit['coverageDocument019'] = record(DOC)
Path(OUT).write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': audit['candidate019']['status'], 'counts': counts, 'catalog': len(catalog), 'sites': exposed,
 'originalFiles': len(sources), 'markers': len(all_markers), 'focusedTests': focus.get('tests'),
 'focusedPassed': focus.get('passed'), 'focusedInputsCurrent': focus.get('inputsStillMatchAtSnapshot'), 'outputs': [record(DOC), record(OUT)]}, indent=2))
