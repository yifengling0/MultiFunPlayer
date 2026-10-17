import { DeviceProfile } from '../DeviceProfile';
import { AxisMapping } from '../AxisMapping';
import { FunscriptAxis, FunscriptDocument, FunscriptParser } from '../Funscript';
import { ResourceLibrary, ResourceFileEntry, ResourceScriptCandidate, ResourceSelectionResult, ResourceAxisSelection } from '../ResourceLibrary';
import { InternalPlaylistItem } from './InternalPlaylist';
import { PlaybackConfiguration } from '../../settings/SettingsSchema';

/** Catalog identities are matched, never opened or converted into URIs. Only the
 * currently scanned Download entries can supply an I/O destination to the host. */
export class InternalSourceLibrary {
  private files: ResourceFileEntry[] = [];
  private durations: Map<string, number> = new Map<string, number>();
  replace(files: ResourceFileEntry[], profile: DeviceProfile): void {
    ResourceLibrary.build(files, profile);
    this.files = files.filter(file => /\.funscript$/i.test(file.name) && InternalSourceLibrary.validAssociation(file.relativePath) &&
      files.filter(other => other.relativePath === file.relativePath || other.uri === file.uri).length === 1)
      .map(file => new ResourceFileEntry(file.uri, file.name, file.relativePath));
    this.durations.clear();
  }
  private static validAssociation(id: string): boolean {
    const settings = new PlaybackConfiguration(); settings.playlistAssociations = [id];
    return PlaybackConfiguration.validate(settings).length === 0;
  }
  resolve(associationId: string): ResourceFileEntry | undefined {
    const file = this.files.find(value => value.relativePath === associationId);
    return file === undefined ? undefined : new ResourceFileEntry(file.uri, file.name, file.relativePath);
  }
  recordDuration(associationId: string, durationSeconds: number): void {
    if (this.resolve(associationId) === undefined) { return; }
    if (!Number.isNaN(durationSeconds) && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) { throw new Error('Invalid internal script duration.'); }
    this.durations.set(associationId, durationSeconds);
  }
  item(associationId: string): InternalPlaylistItem {
    const file = this.resolve(associationId);
    return new InternalPlaylistItem(file === undefined ? associationId.split('/').pop()! : file.name,
      associationId, associationId, this.durations.get(associationId) ?? Number.NaN, file !== undefined);
  }
  items(): InternalPlaylistItem[] { return this.files.map(file => this.item(file.relativePath)); }
  refresh(item: InternalPlaylistItem): void {
    item.exists = this.resolve(item.associationId) !== undefined;
    item.durationSeconds = this.durations.get(item.associationId) ?? Number.NaN;
  }
  /** Original direct Internal loading explicitly uses FindAxesMatchingName(name,
   * isUnnamedScript:true): even movie.roll.funscript drives wildcard axes when
   * additional-script search is off. Embedded multi-axis IDs still win. */
  static selectSingle(candidate: ResourceScriptCandidate, profile: DeviceProfile): ResourceSelectionResult {
    const result = new ResourceSelectionResult();
    const enabled = profile.axes.filter(axis => axis.enabled);
    const axes = candidate.isMultiAxis ? candidate.document.axes.filter(axis =>
      candidate.resourceAxes.indexOf(axis.name) >= 0 && enabled.some(definition => definition.name === axis.name)) :
      candidate.hasSingleAxis ? enabled.filter(axis => axis.funscriptNames.indexOf('*') >= 0)
        .map(axis => new FunscriptAxis(axis.name, candidate.document.axes[0].actions)) : [];
    if (axes.length === 0 || axes.some(axis => axis.actions.length === 0)) { return result; }
    result.document = FunscriptParser.cloneDocument(new FunscriptDocument(axes, candidate.document.metadata));
    result.selectedFiles = [candidate.file];
    result.axisSources = axes.map(axis => new ResourceAxisSelection(axis.name, candidate.file,
      new FunscriptDocument([axis], candidate.document.metadata)));
    return result;
  }
  static companionMedia(file: ResourceFileEntry, profile: DeviceProfile): ResourceFileEntry {
    const name = AxisMapping.baseNameWithExtension(file.name, profile);
    const slash = file.relativePath.lastIndexOf('/');
    const path = (slash < 0 ? '' : file.relativePath.slice(0, slash + 1)) + name;
    // This name is a search key only. Its URI remains the actual managed file.
    return new ResourceFileEntry(file.uri, name, path);
  }
}
