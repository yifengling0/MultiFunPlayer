import { RemoteMediaSession } from '../app/RemoteMediaSession';
import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { PlaybackSession } from '../app/PlaybackSession';
import { NativeOutputSession } from '../app/NativeOutputSession';
import { NativeWindowPresentation } from '../presentation/NativeWindowPresentation';

export default class EntryAbility extends UIAbility {
  private stageGeneration: number = 0;
  private applicationForeground: boolean = true;
  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    const generation = ++this.stageGeneration;
    NativeOutputSession.setForeground(this.applicationForeground);
    AppStorage.setOrCreate('mfpForeground', this.applicationForeground);
    try {
      await PlaybackSession.initialize(this.context.filesDir);
      if (generation !== this.stageGeneration) { return; }
      await NativeWindowPresentation.attachStage(windowStage);
      if (generation !== this.stageGeneration) { return; }
      await NativeWindowPresentation.setForeground(this.applicationForeground);
      if (generation !== this.stageGeneration) { return; }
      await windowStage.loadContent('pages/Index');
    } catch (error) {
      if (generation !== this.stageGeneration) { return; }
      NativeOutputSession.setForeground(false);
      NativeWindowPresentation.setForeground(false);
      AppStorage.setOrCreate('mfpForeground', false);
      console.error('MultiFunPlayer failed to create its main window');
    }
  }
  onForeground(): void {
    this.applicationForeground = true; NativeOutputSession.setForeground(true);
    AppStorage.setOrCreate('mfpForeground', true); NativeWindowPresentation.setForeground(true);
  }
  onBackground(): void {
    RemoteMediaSession.closeIfReady();
    this.applicationForeground = false; NativeOutputSession.setForeground(false);
    AppStorage.setOrCreate('mfpForeground', false); NativeWindowPresentation.setForeground(false); PlaybackSession.flushIfReady();
  }
  onWindowStageDestroy(): void {
    RemoteMediaSession.closeIfReady();
    this.stageGeneration++; NativeWindowPresentation.destroyStage();
    NativeOutputSession.setForeground(false); AppStorage.setOrCreate('mfpForeground', false);
  }
  onDestroy(): void {
    RemoteMediaSession.closeIfReady();
    this.stageGeneration++; this.applicationForeground = false; NativeWindowPresentation.destroyStage();
    NativeOutputSession.closeIfReady(); AppStorage.setOrCreate('mfpForeground', false); PlaybackSession.flushIfReady();
  }
}
