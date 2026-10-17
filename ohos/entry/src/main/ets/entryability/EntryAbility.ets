import { NativeKeyboardWindow } from '../app/NativeKeyboardWindow';
import { RemoteMediaSession } from '../app/RemoteMediaSession';
import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { PlaybackSession } from '../app/PlaybackSession';
import { NativeOutputSession } from '../app/NativeOutputSession';
import { NativeWindowPresentation } from '../presentation/NativeWindowPresentation';

export default class EntryAbility extends UIAbility {
  private static lifecycleSequence: number = 0;
  private lifecycleOwner: number = 0;
  private stageGeneration: number = 0;
  private keyboardWindowOwner: number = 0;
  private applicationForeground: boolean = true;
  private ownsLifecycle(): boolean { return this.lifecycleOwner > 0 && this.lifecycleOwner === EntryAbility.lifecycleSequence; }
  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    this.lifecycleOwner = ++EntryAbility.lifecycleSequence;
    const generation = ++this.stageGeneration;
    const keyboardOwner = NativeKeyboardWindow.claimStage(this.applicationForeground);
    this.keyboardWindowOwner = keyboardOwner;
    NativeOutputSession.setForeground(this.applicationForeground);
    AppStorage.setOrCreate('mfpForeground', this.applicationForeground);
    try {
      await PlaybackSession.initialize(this.context.filesDir);
      if (generation !== this.stageGeneration || !this.ownsLifecycle()) { return; }
      NativeKeyboardWindow.bindStage(keyboardOwner, windowStage);
      await NativeWindowPresentation.attachStage(windowStage);
      if (generation !== this.stageGeneration || !this.ownsLifecycle()) { return; }
      await NativeWindowPresentation.setForeground(this.applicationForeground);
      if (generation !== this.stageGeneration || !this.ownsLifecycle()) { return; }
      await windowStage.loadContent('pages/Index');
    } catch (error) {
      if (generation !== this.stageGeneration || !this.ownsLifecycle()) { return; }
      NativeKeyboardWindow.releaseStage(keyboardOwner);
      NativeOutputSession.setForeground(false);
      NativeWindowPresentation.setForeground(false);
      AppStorage.setOrCreate('mfpForeground', false);
      console.error('MultiFunPlayer failed to create its main window');
    }
  }
  onForeground(): void {
    this.applicationForeground = true;
    if (!this.ownsLifecycle()) { return; }
    NativeKeyboardWindow.setForeground(this.keyboardWindowOwner, true);
    NativeOutputSession.setForeground(true);
    AppStorage.setOrCreate('mfpForeground', true); NativeWindowPresentation.setForeground(true);
  }
  onBackground(): void {
    this.applicationForeground = false;
    if (!this.ownsLifecycle()) { return; }
    NativeKeyboardWindow.setForeground(this.keyboardWindowOwner, false);
    RemoteMediaSession.closeIfReady(); NativeOutputSession.setForeground(false);
    AppStorage.setOrCreate('mfpForeground', false); NativeWindowPresentation.setForeground(false); PlaybackSession.flushIfReady();
  }
  onWindowStageDestroy(): void {
    this.stageGeneration++;
    if (!this.ownsLifecycle()) { return; }
    NativeKeyboardWindow.releaseStage(this.keyboardWindowOwner); this.keyboardWindowOwner = 0;
    RemoteMediaSession.closeIfReady(); NativeWindowPresentation.destroyStage();
    NativeOutputSession.setForeground(false); AppStorage.setOrCreate('mfpForeground', false);
  }
  onDestroy(): void {
    this.stageGeneration++; this.applicationForeground = false;
    if (!this.ownsLifecycle()) { return; }
    NativeKeyboardWindow.releaseStage(this.keyboardWindowOwner); this.keyboardWindowOwner = 0;
    RemoteMediaSession.closeIfReady(); NativeWindowPresentation.destroyStage();
    NativeOutputSession.closeIfReady(); AppStorage.setOrCreate('mfpForeground', false); PlaybackSession.flushIfReady();
    this.lifecycleOwner = 0;
  }
}
