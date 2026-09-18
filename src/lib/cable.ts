/**
 * ONE WebSocket for the whole app, shared by every channel.
 *
 * ── Why one consumer and not one per feature ──────────────────────────────
 * A consumer per feature means a fresh handshake whenever any of them mounts,
 * and **ActionCable never replays**: everything broadcast during that gap is
 * gone. multi_magic's web client learned this and says so in its own header —
 * the assistant used to own a consumer, so opening or closing the assistant
 * window dropped whatever arrived meanwhile.
 *
 * ── This module knows nothing about the assistant ─────────────────────────
 * `Conversation` is one model with an `is_ai` boolean
 * (`app/models/conversation.rb:19`), and both kinds of thread read their
 * history from the SAME endpoint with the SAME cursor. Two channels sit on top:
 *
 *   MessageChannel       `stream_for current_user`     — no params; the
 *                                                        assistant's replies
 *   ConversationChannel  `stream_for @conversation`    — `{ conversation_id }`;
 *                                                        messages from people
 *
 * So the subscription manager takes a channel name and params, and the
 * reconnect rule is stated once for both. The assistant is the first CONSUMER
 * of this file, not its shape.
 *
 * ── THE RULE THIS FILE EXISTS FOR ─────────────────────────────────────────
 * `onConnected` fires on the FIRST connect and on EVERY reconnect, and a
 * listener must treat it as "you have missed things — go and read them". The
 * socket cannot tell you what it dropped. Recovery is an HTTP re-read of
 * `GET /api/v1/conversations/:id/messages`, never a replay.
 */
import { AppState, type AppStateStatus } from "react-native";
import { installActionCableShim } from "./actioncableShim";
import { WS_URL } from "@/config/env";
import { loadSessionEmail, loadToken } from "@/api/http";
import { getDeviceFingerprint } from "./fingerprint";

// Must run before any connection is opened — see the shim's header.
installActionCableShim();

// Required AFTER the shim. `require` rather than a top-level `import` so the
// order is a fact of execution rather than a convention a bundler may reorder.
/* eslint-disable @typescript-eslint/no-var-requires */
const { createConsumer } = require("@rails/actioncable") as {
  createConsumer: (url: string) => CableConsumer;
};
/* eslint-enable @typescript-eslint/no-var-requires */

interface CableSubscription {
  unsubscribe: () => void;
  perform: (action: string, data?: Record<string, unknown>) => void;
}

interface CableConsumer {
  subscriptions: {
    create: (
      channel: string | Record<string, unknown>,
      mixin: {
        received?: (data: unknown) => void;
        connected?: () => void;
        disconnected?: () => void;
        rejected?: () => void;
      },
    ) => CableSubscription;
  };
  connection: { isOpen: () => boolean; reopen: () => void };
  disconnect: () => void;
}

export interface ChannelListener<T> {
  onData: (payload: T) => void;
  /**
   * First connect AND every reconnect. Resync here — nothing broadcast while
   * the socket was down is ever replayed.
   */
  onConnected?: () => void;
  /** The server refused the subscription (not a member, or gone). */
  onRejected?: () => void;
}

export type ChannelParams = Record<string, string | number>;

interface ChannelState {
  name: string;
  params?: ChannelParams;
  subscription: CableSubscription | null;
  listeners: Set<ChannelListener<unknown>>;
}

const channels = new Map<string, ChannelState>();

let consumer: CableConsumer | null = null;
/**
 * The URL the live consumer was built with. The token is IN the URL, so a
 * login or logout invalidates the socket — comparing this is how we notice.
 */
let consumerUrl = "";
let appStateSubscription: { remove: () => void } | null = null;

/** One entry per channel AND its params: a thread is its own subscription. */
function keyFor(name: string, params?: ChannelParams): string {
  return params ? `${name}:${JSON.stringify(params)}` : name;
}

/**
 * `?token=…&email=…&fp=…`
 *
 * All three are QUERY PARAMETERS rather than headers, and that is not a style
 * choice: a WebSocket upgrade cannot carry custom headers, so this is the only
 * channel available. `application_cable/connection.rb:19-28` says so in its own
 * comment, and records that omitting `fp` made the server compare the stored
 * fingerprint against an empty one and reject every connection as a stolen
 * token — "messages typed into a chat went nowhere".
 *
 * `token` is the FULL header value, `"Bearer eyJ…"`, because the server does
 * `token.split.last` (`connection.rb:44`). Sending the bare JWT works by luck —
 * `split` on a string with no spaces returns the whole string — but sending it
 * pre-stripped would break the moment that line changed, and the web sends the
 * prefixed form. Match the web.
 */
async function buildUrl(): Promise<string | null> {
  const token = await loadToken();
  const email = await loadSessionEmail();
  if (!token || !email) return null;

  const fp = await getDeviceFingerprint();
  const query = new URLSearchParams({ token, email, fp }).toString();
  return `${WS_URL}?${query}`;
}

function ensureAppStateWatcher(): void {
  if (appStateSubscription) return;

  /**
   * React Native's answer to `visibilitychange`, which is the listener the
   * shim drops. ActionCable's own ConnectionMonitor reopens a stale connection
   * when a browser tab becomes visible again; on a phone the equivalent moment
   * is the app returning to the foreground, and it matters more here — a phone
   * is backgrounded far more aggressively than a tab is hidden, and an answer
   * arriving from a job while the app is in someone's pocket is the exact case
   * the resync exists for.
   */
  appStateSubscription = AppState.addEventListener(
    "change",
    (status: AppStateStatus) => {
      if (status !== "active") return;
      if (!consumer) return;
      // `reopen` is a no-op on a healthy socket, so this is safe to call on
      // every foreground. When it does reconnect, `connected` fires and every
      // listener resyncs — which is the whole recovery path.
      if (!consumer.connection.isOpen()) consumer.connection.reopen();
    },
  );
}

async function ensureConsumer(): Promise<CableConsumer | null> {
  const url = await buildUrl();
  if (!url) return null;

  if (consumer && consumerUrl === url) return consumer;

  // The token changed (or this is the first connect). Tear the old socket down
  // rather than leaving one authenticated as the previous session.
  if (consumer) {
    for (const state of channels.values()) {
      state.subscription?.unsubscribe();
      state.subscription = null;
    }
    consumer.disconnect();
  }

  consumer = createConsumer(url);
  consumerUrl = url;
  ensureAppStateWatcher();
  return consumer;
}

function attach(state: ChannelState, cable: CableConsumer): void {
  if (state.subscription) return;

  const identifier = state.params
    ? { channel: state.name, ...state.params }
    : { channel: state.name };

  state.subscription = cable.subscriptions.create(identifier, {
    received: (data: unknown) => {
      for (const listener of state.listeners) listener.onData(data);
    },
    connected: () => {
      for (const listener of state.listeners) listener.onConnected?.();
    },
    rejected: () => {
      for (const listener of state.listeners) listener.onRejected?.();
    },
  });
}

/**
 * Listen to one channel. Returns the unsubscribe function.
 *
 * Subscribing is async because the token and fingerprint are read from the
 * keystore, but the caller gets a synchronous teardown — an effect that
 * unmounts before the socket is up must still cancel cleanly, and awaiting a
 * promise in a cleanup function is how a listener outlives its component.
 */
export function subscribeToChannel<T>(
  name: string,
  listener: ChannelListener<T>,
  params?: ChannelParams,
): () => void {
  const key = keyFor(name, params);
  let state = channels.get(key);
  if (!state) {
    state = { name, params, subscription: null, listeners: new Set() };
    channels.set(key, state);
  }

  const entry = listener as ChannelListener<unknown>;
  state.listeners.add(entry);

  let cancelled = false;
  void ensureConsumer().then((cable) => {
    if (cancelled || !cable) return;
    const current = channels.get(key);
    if (current && current.listeners.size > 0) attach(current, cable);
  });

  return () => {
    cancelled = true;
    const current = channels.get(key);
    if (!current) return;
    current.listeners.delete(entry);
    if (current.listeners.size > 0) return;

    current.subscription?.unsubscribe();
    current.subscription = null;
    channels.delete(key);
  };
}

/**
 * Send an action to a channel — `mark_read` and `typing` on ConversationChannel.
 *
 * Returns false when the subscription is not up, and the caller must treat that
 * as "it did not happen". `perform` on a dead subscription is a SILENT no-op,
 * which is why multi_magic moved sending messages off the socket and onto HTTP
 * (`conversation_channel.rb` header: a send "was silently dropped whenever the
 * subscription was not up, with nothing to retry"). `mark_read` is safe to lose
 * — it is re-sent next time the thread opens — but the caller should know.
 */
export function performOnChannel(
  name: string,
  action: string,
  data?: Record<string, unknown>,
  params?: ChannelParams,
): boolean {
  const state = channels.get(keyFor(name, params));
  if (!state?.subscription) return false;
  state.subscription.perform(action, data);
  return true;
}

/** Called on sign-out: drop the socket so it cannot outlive the session. */
export function resetCable(): void {
  for (const state of channels.values()) {
    state.subscription?.unsubscribe();
  }
  channels.clear();
  consumer?.disconnect();
  consumer = null;
  consumerUrl = "";
  appStateSubscription?.remove();
  appStateSubscription = null;
}
