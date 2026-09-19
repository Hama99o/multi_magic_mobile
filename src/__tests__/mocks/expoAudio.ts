/**
 * A STATEFUL FAKE OF `expo-audio`, in its own module — and the reason it is
 * not written inline in `setup.ts` is a rule worth stating once.
 *
 * `babel-plugin-jest-hoist` hoists a `jest.mock()` factory above the imports
 * and then refuses any identifier in it that is not on its allowlist. A TYPE
 * counts: `Record<string, unknown>` in a parameter annotation is the
 * identifier `Record`, and it fails the whole FILE to load — 17 suites at
 * once, with an error that names neither the type nor the factory. `require`
 * IS on the allowlist, so a fake that needs types lives in a module and the
 * factory is one `require` call.
 *
 * The fake is stateful because the store is judged by what a real player would
 * receive: `play`/`pause`/`seekTo` move the fields a listener would see, and
 * `__emit` delivers a status event, so "it finished" is exercised rather than
 * asserted about.
 */
export interface FakeAudioStatus {
  playing?: boolean;
  didJustFinish?: boolean;
}

export interface FakeAudioPlayer {
  source: unknown;
  playing: boolean;
  paused: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  removeAllListeners: jest.Mock;
  /** Deliver a status event, as the native module does. */
  __emit: (status: FakeAudioStatus) => void;
}

export const createAudioPlayer = jest.fn((source: unknown): FakeAudioPlayer => {
  const listeners = new Set<(status: FakeAudioStatus) => void>();
  const player: FakeAudioPlayer = {
    source,
    playing: false,
    paused: false,
    currentTime: 0,
    duration: 0,
    isLoaded: true,
    play: jest.fn(() => {
      player.playing = true;
      player.paused = false;
    }),
    pause: jest.fn(() => {
      player.playing = false;
      player.paused = true;
    }),
    seekTo: jest.fn(async (seconds: number) => {
      player.currentTime = seconds;
    }),
    remove: jest.fn(),
    addListener: jest.fn((_event: string, listener: (status: FakeAudioStatus) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    removeAllListeners: jest.fn(() => listeners.clear()),
    __emit: (status: FakeAudioStatus) => {
      for (const listener of listeners) listener(status);
    },
  };
  return player;
});

export const setAudioModeAsync = jest.fn(async () => {});
