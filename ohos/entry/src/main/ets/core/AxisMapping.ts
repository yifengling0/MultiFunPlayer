import { DeviceProfile, DeviceProfiles } from './DeviceProfile';
import { FunscriptDocument, FunscriptParser, FunscriptAxis } from './Funscript';

class ScriptAxisPresence {
  axes?: FunscriptAxis[];
}

/** Filename aliases from upstream DeviceSettings.DefaultDevices, scoped by profile.
 * Disabled axes are retained for discovery but excluded from matches by default.
 * This module only identifies scripts. It does not select or drive any device.
 */
export class AxisDefinition {
  name: string;
  friendlyName: string;
  funscriptNames: string[];
  enabled: boolean;
  constructor(name: string, friendlyName: string, funscriptNames: string[], enabled: boolean = true) {
    this.name = name; this.friendlyName = friendlyName;
    this.funscriptNames = funscriptNames; this.enabled = enabled;
  }
}

export class AxisMapping {
  /** Filename mapping applies only to conventional top-level actions, never
   * embedded axis IDs. Unknown or disabled suffixes preserve the parser's L0.
   * A second bounded JSON read inspects axis presence without changing metadata.
   */
  static parseScript(json: string, fileName: string, profile: string | DeviceProfile = 'TCode-0.3'): FunscriptDocument {
    const document: FunscriptDocument = FunscriptParser.parse(json);
    const source: ScriptAxisPresence = JSON.parse(json) as ScriptAxisPresence;
    const matches: AxisDefinition[] = AxisMapping.findAxesMatchingName(fileName, profile);
    if (source.axes === undefined && document.axes.length === 1 && matches.length === 1) {
      document.axes[0].name = matches[0].name;
    }
    if (typeof profile !== 'string') {
      const enabled = DeviceProfiles.enabledAxes(profile).map(axis => axis.name);
      document.axes = document.axes.filter(axis => enabled.indexOf(axis.name) >= 0);
      return new FunscriptDocument(document.axes, document.metadata);
    }
    return document;
  }

  static defaultAxes(profile: string | DeviceProfile = 'TCode-0.3'): AxisDefinition[] {
    const selected: DeviceProfile = typeof profile === 'string' ? DeviceProfiles.getBuiltIn(profile) : profile;
    const errors = DeviceProfiles.validate(selected).filter(item => item.severity === 'error');
    if (errors.length > 0) { throw new Error(errors.map(item => item.message).join('; ')); }
    return selected.axes.map(axis => new AxisDefinition(axis.name, axis.friendlyName || axis.name, axis.funscriptNames.slice(), axis.enabled));
  }

  /** Matches dot-delimited suffixes case-insensitively. Unknown suffixes use '*'.
   * Known aliases from either upstream profile never fall back to '*', even when
   * their axis is absent or disabled in the selected profile.
   * Optional mediaName requires the stripped script basename to match the media.
   */
  static findAxesMatchingName(scriptName: string, profile: string | DeviceProfile = 'TCode-0.3',
    includeDisabled: boolean = false, mediaName?: string): AxisDefinition[] {
    const axes: AxisDefinition[] = AxisMapping.defaultAxes(profile);
    const stem: string = AxisMapping.stem(scriptName).toLowerCase();
    if (stem.length === 0) { return []; }
    const suffix: string = AxisMapping.knownSuffix(stem, profile);
    let unnamed: boolean = suffix.length === 0;
    if (mediaName !== undefined) {
      const base: string = suffix.length > 0 ? stem.slice(0, -suffix.length) : stem;
      const mediaStem: string = AxisMapping.stem(mediaName).toLowerCase();
      if (base !== mediaStem) { return []; }
      unnamed = stem === mediaStem;
    }
    const matches: AxisDefinition[] = [];
    for (const axis of axes) {
      if (!includeDisabled && !axis.enabled) { continue; }
      for (const alias of axis.funscriptNames) {
        if ((unnamed && alias === '*') || (!unnamed && alias !== '*' && stem.endsWith('.' + alias.toLowerCase()))) {
          matches.push(axis); break;
        }
      }
    }
    return matches;
  }

  /** DeviceAxisUtils.GetBaseNameWithExtension, used by Internal companion search. */
  static baseNameWithExtension(fileName: string, profile: string | DeviceProfile = 'TCode-0.3'): string {
    const stem = AxisMapping.stem(fileName);
    const suffix = AxisMapping.knownSuffix(stem.toLowerCase(), profile);
    const dot = fileName.lastIndexOf('.');
    return suffix.length === 0 ? fileName : stem.slice(0, -suffix.length) + (dot < 0 ? '' : fileName.slice(dot));
  }

  private static stem(fileName: string): string {
    if (typeof fileName !== 'string' || fileName.length > 4096) { throw new Error('Invalid filename.'); }
    const name: string = fileName.replace(/\\/g, '/').split('/').pop() as string;
    const dot: number = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(0, dot) : name;
  }

  private static knownSuffix(stem: string, selected: string | DeviceProfile): string {
    for (const profile of [selected, 'TCode-0.2', 'TCode-0.3']) {
      for (const axis of AxisMapping.defaultAxes(profile)) {
        for (const alias of axis.funscriptNames) {
          const suffix: string = '.' + alias.toLowerCase();
          if (alias !== '*' && stem.endsWith(suffix)) { return suffix; }
        }
      }
    }
    return '';
  }
}
