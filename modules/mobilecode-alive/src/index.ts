import { requireNativeModule } from "expo";

interface AliveNativeModule {
  start: (title: string, message: string) => void;
  stop: () => void;
}

const Alive = requireNativeModule<AliveNativeModule>("MobilecodeAlive");

export function startAliveService(title: string, message: string): void {
  Alive.start(title, message);
}

export function stopAliveService(): void {
  Alive.stop();
}
