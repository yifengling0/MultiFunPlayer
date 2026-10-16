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
  static parseScript(json: string, fileName: string, profile: string = 'TCode-0.3'): FunscriptDocument {
    const document: FunscriptDocument = FunscriptParser.parse(json);
    const source: ScriptAxisPresence = JSON.parse(json) as ScriptAxisPresence;
    const matches: AxisDefinition[] = AxisMapping.findAxesMatchingName(fileName, profile);
    if (source.axes === undefined && document.axes.length === 1 && matches.length === 1) {
      document.axes[0].name = matches[0].name;
    }
    return document;
  }

  static defaultAxes(profile: string = 'TCode-0.3'): AxisDefinition[] {
    if (profile !== 'TCode-0.2' && profile !== 'TCode-0.3') { throw new Error('Unknown axis profile.'); }
    const axes: AxisDefinition[] = [
      new AxisDefinition('L0', 'Up/Down', ['*', 'stroke', 'L0', 'up']),
      new AxisDefinition('L1', 'Forward/Backward', ['surge', 'L1', 'forward']),
      new AxisDefinition('L2', 'Left/Right', ['sway', 'L2', 'left']),
      new AxisDefinition('R0', 'Twist', ['twist', 'R0', 'yaw']),
      new AxisDefinition('R1', 'Roll', ['roll', 'R1']),
      new AxisDefinition('R2', 'Pitch', ['pitch', 'R2']),
      new AxisDefinition('V0', 'Vibrate', ['vib', 'V0'], false)
    ];
    if (profile === 'TCode-0.2') {
      axes.push(new AxisDefinition('V1', 'Pump', ['pump', 'lube', 'V1'], false));
      axes.push(new AxisDefinition('L3', 'Suction', ['suck', 'valve', 'L3'], false));
    } else {
      axes.push(new AxisDefinition('V1', 'Pump', ['pump', 'V1'], false));
      axes.push(new AxisDefinition('A0', 'Valve', ['valve', 'A0'], false));
      axes.push(new AxisDefinition('A1', 'Suction', ['suck', 'A1'], false));
      axes.push(new AxisDefinition('A2', 'Lube', ['lube', 'A2'], false));
    }
    return axes;
  }

  /** Matches dot-delimited suffixes case-insensitively. Unknown suffixes use '*'.
   * Known aliases from either upstream profile never fall back to '*', even when
   * their axis is absent or disabled in the selected profile.
   * Optional mediaName requires the stripped script basename to match the media.
   */
  static findAxesMatchingName(scriptName: string, profile: string = 'TCode-0.3',
    includeDisabled: boolean = false, mediaName?: string): AxisDefinition[] {
    const axes: AxisDefinition[] = AxisMapping.defaultAxes(profile);
    const stem: string = AxisMapping.stem(scriptName).toLowerCase();
    if (stem.length === 0) { return []; }
    const suffix: string = AxisMapping.knownSuffix(stem);
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

  private static stem(fileName: string): string {
    if (typeof fileName !== 'string' || fileName.length > 4096) { throw new Error('Invalid filename.'); }
    const name: string = fileName.replace(/\\/g, '/').split('/').pop() as string;
    const dot: number = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(0, dot) : name;
  }

  private static knownSuffix(stem: string): string {
    for (const profile of ['TCode-0.2', 'TCode-0.3']) {
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
