import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s + '.ts' : s, c); } });
const { SettingsSchema, AppConfiguration, PlaybackConfiguration } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { GeneralConfiguration } = await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const { MediaSourceConfiguration } = await import('../entry/src/main/ets/settings/MediaSourceConfiguration.ts');
const { SyncConfiguration } = await import('../entry/src/main/ets/core/AxisConfiguration.ts');
const { OutputConfiguration, SavedOutputTarget } = await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
const { KeyboardShortcutConfiguration, KeyboardShortcutMapping } = await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const { ContinuousInputConfiguration, ContinuousInputMapping } = await import('../entry/src/main/ets/input/ContinuousInputConfiguration.ts');
const root = new URL('../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const index = read('pages/Index.ets');

/** Every persisted preference family must have a visible editing surface. The
 * audit parses the actual configuration classes and the actual panel sources,
 * so a schema field that loses its control fails here instead of shipping. */
const SURFACES = [
  { panel: 'components/GeneralSettingsPanel.ets', classes: ['GeneralConfiguration'], file: 'settings/GeneralConfiguration.ts' },
  { panel: 'components/SyncSettingsPanel.ets', classes: ['SyncConfiguration'], file: 'core/AxisConfiguration.ts' },
  { panel: 'components/DeoVrSourcePanel.ets', classes: ['MediaSourceConfiguration', 'DeoVrEndpointConfiguration', 'HereSphereEndpointConfiguration'], file: 'settings/MediaSourceConfiguration.ts' },
  { panel: 'components/AxisSettingsPanel.ets', classes: ['AxisConfigurationFields', 'AxisConfiguration'], file: 'core/AxisConfiguration.ts' },
  { panel: 'components/MotionSettingsPanel.ets', classes: ['MotionProviderConfiguration'], file: 'core/MotionConfiguration.ts' },
  { panel: 'components/InputSettingsPanel.ets', classes: ['KeyboardShortcutConfiguration', 'KeyboardShortcutMapping'], file: 'input/ShortcutConfiguration.ts' },
  { panel: 'components/ContinuousInputPanel.ets', classes: ['ContinuousInputConfiguration', 'ContinuousInputMapping'], file: 'input/ContinuousInputConfiguration.ts' },
  { panel: 'components/OutputSettingsPanel.ets', classes: ['SavedOutputTarget'], file: 'settings/OutputConfiguration.ts' },
  { panel: 'components/InternalPlaylistPanel.ets', classes: ['PlaybackConfiguration'], file: 'settings/SettingsSchema.ts' }
];
const KNOWN_INDIRECT = new Map([
  ['rangesByDevice', 'nested output-range container edited through the range editor, never a standalone field']
]);

function classFields(source, className) {
  const marker = new RegExp('(?:export )?class ' + className + ' [^{]*\\{');
  const match = marker.exec(source);
  assert.ok(match, 'configuration class exists: ' + className);
  const start = match.index + match[0].length;
  const next = source.indexOf('\nclass ', start);
  const nextExport = source.indexOf('\nexport class ', start);
  const ends = [next, nextExport].filter(value => value > start);
  const body = source.slice(start, ends.length > 0 ? Math.min(...ends) : undefined);
  return [...body.matchAll(/^  (?:readonly )?(\w+)(\??):/gm)].map(field => field[1]);
}

test('every persisted setting family has a visible editing surface', () => {
  let audited = 0;
  const indirect = [];
  for (const surface of SURFACES) {
    const configuration = read(surface.file);
    const panel = read(surface.panel) + '\n' + index;
    assert.match(panel, /Settings(?:Number|Text|Switch|Choice)Field|SettingsSectionTitle/, surface.panel);
    for (const className of surface.classes) {
      for (const field of classFields(configuration, className)) {
        audited++;
        if (KNOWN_INDIRECT.has(field)) { indirect.push(field); continue; }
        assert.match(panel, new RegExp('\\b' + field + '\\b'),
          surface.panel + ' must expose ' + className + '.' + field);
      }
    }
  }
  assert.ok(audited >= 110, 'the settings surface audit covers every writable family, audited=' + audited);
  assert.ok(indirect.length <= 3, 'only explicitly documented indirect containers may skip a labelled control');
});

test('simple preference edits roundtrip through the persisted schema', () => {
  const decode = configuration => {
    const encoded = SettingsSchema.encode(configuration);
    const result = SettingsSchema.decode(encoded);
    assert.equal(result.status, 'valid', result.diagnostics.map(item => item.message).join('; '));
    return result.configuration;
  };
  const base = SettingsSchema.defaults();
  const general = new GeneralConfiguration();
  general.uiDensity = 'compact'; general.appOrientation = 'horizontal'; general.errorDisplayType = 'none';
  base.general = general;
  const sync = new SyncConfiguration();
  sync.durationSeconds = 2.5;
  sync.syncOnMediaResourceChanged = false; sync.syncOnScriptResourceChanged = false;
  sync.syncOnScriptStart = false; sync.syncOnScriptEnd = false;
  sync.syncOnMediaPlayPause = false; sync.syncOnSeek = false; sync.syncOnAutoHomeStartEnd = false;
  base.sync = sync;
  base.playback.internalLooping = true; base.playback.internalShuffling = false;
  base.playback.internalAutoConnect = true; base.playback.loadAdditionalScripts = true;
  base.playback.autoSkipEnabled = false; base.playback.autoSkipOffsetSeconds = -12;
  base.globalOffsetSeconds = 0.75;
  const media = new MediaSourceConfiguration();
  media.selectedSource = 'deovr'; media.deoVr.host = '192.0.2.10'; media.deoVr.port = 23456;
  media.hereSphere.host = '192.0.2.11'; media.hereSphere.port = 34567;
  base.mediaSources = media;
  const restored = decode(base);
  assert.equal(restored.general.uiDensity, 'compact');
  assert.equal(restored.general.appOrientation, 'horizontal');
  assert.equal(restored.general.errorDisplayType, 'none');
  assert.equal(restored.sync.durationSeconds, 2.5);
  assert.equal(restored.sync.syncOnSeek, false);
  assert.equal(restored.playback.internalLooping, true);
  assert.equal(restored.playback.internalAutoConnect, true);
  assert.equal(restored.playback.autoSkipOffsetSeconds, -12);
  assert.equal(restored.globalOffsetSeconds, 0.75);
  assert.equal(restored.mediaSources.selectedSource, 'deovr');
  assert.equal(restored.mediaSources.deoVr.host, '192.0.2.10');
  assert.equal(restored.mediaSources.deoVr.port, 23456);
  assert.equal(restored.mediaSources.hereSphere.port, 34567);
});

test('keyboard and continuous-input preferences roundtrip as editable arrays', () => {
  const config = new AppConfiguration();
  const keyboard = new KeyboardShortcutConfiguration();
  keyboard.enabled = true;
  keyboard.mappings = [new KeyboardShortcutMapping('ui-smoke', 'smoke mapping')];
  keyboard.mappings[0].enabled = true;
  keyboard.mappings[0].clickCount = 2;
  config.keyboard = keyboard;
  const continuous = new ContinuousInputConfiguration();
  continuous.enabled = true;
  continuous.mappings = [new ContinuousInputMapping('ui-continuous', 'smoke continuous')];
  continuous.mappings[0].speed = 0.75;
  continuous.mappings[0].invert = true;
  config.continuousInput = continuous;
  const result = SettingsSchema.decode(SettingsSchema.encode(config));
  assert.equal(result.status, 'valid');
  assert.equal(result.configuration.keyboard.mappings[0].name, 'smoke mapping');
  assert.equal(result.configuration.keyboard.mappings[0].clickCount, 2);
  assert.equal(result.configuration.continuousInput.enabled, true);
  assert.equal(result.configuration.continuousInput.mappings[0].name, 'smoke continuous');
  assert.equal(result.configuration.continuousInput.mappings[0].speed, 0.75);
  assert.equal(result.configuration.continuousInput.mappings[0].invert, true);
});

test('output targets expose endpoint, dispatch and range preferences without runtime state', () => {
  const config = new AppConfiguration();
  const target = new SavedOutputTarget('tcp', 0);
  target.name = 'UI target';
  target.host = '192.0.2.20'; target.port = 9999; target.polled = true; target.intervalMs = 16;
  target.dirtyOnly = false; target.offloadElapsed = true; target.pausedAutoHome = true;
  target.pausedMotion = false; target.pausedManual = true;
  config.outputs = new OutputConfiguration();
  config.outputs.targets = [target];
  config.outputs.selectedTargetId = target.id;
  const result = SettingsSchema.decode(SettingsSchema.encode(config));
  assert.equal(result.status, 'valid');
  const restored = result.configuration.outputs.targets.find(value => value.id === 'tcp:0');
  assert.ok(restored !== undefined);
  assert.equal(restored.host, '192.0.2.20');
  assert.equal(restored.port, 9999);
  assert.equal(restored.polled, true);
  assert.equal(restored.intervalMs, 16);
  assert.equal(restored.offloadElapsed, true);
  assert.equal(restored.pausedAutoHome, true);
  assert.equal(restored.pausedManual, true);
  const encoded = SettingsSchema.encode(config);
  for (const runtimeOnly of ['"armed"', '"connected"', '"dispatchSuspended"', '"generation"']) {
    assert.equal(encoded.includes(runtimeOnly), false, runtimeOnly + ' is session state');
  }
});

test('playlist and axis preferences remain editable through the same schema', () => {
  const config = new AppConfiguration();
  const playback = new PlaybackConfiguration();
  playback.playlistAssociations = [];
  playback.internalLooping = false; playback.internalShuffling = true;
  config.playback = playback;
  const axis = config.axisSettingsByDevice[0].axes[0].settings;
  axis.scriptScale = 1.5; axis.offsetSeconds = 0.25; axis.invertScript = true;
  axis.autoHomeEnabled = false; axis.autoHomeDelaySeconds = 1.5;
  const result = SettingsSchema.decode(SettingsSchema.encode(config));
  assert.equal(result.status, 'valid');
  assert.equal(result.configuration.playback.internalShuffling, true);
  const restored = result.configuration.axisSettingsByDevice[0].axes[0].settings;
  assert.equal(restored.scriptScale, 1.5);
  assert.equal(restored.offsetSeconds, 0.25);
  assert.equal(restored.invertScript, true);
  assert.equal(restored.autoHomeEnabled, false);
  assert.equal(restored.autoHomeDelaySeconds, 1.5);
});
