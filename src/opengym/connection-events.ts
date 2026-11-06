import type { OpenGymConnection } from './types';

type Change = 'stop' | 'changed';
const listeners = new Set<(change: Change) => void>();
const channelName = 'ironlaw-opengym-connection';
export function sameConnection(a: OpenGymConnection | null, b: OpenGymConnection | null): boolean {
  return a === null || b === null
    ? a === b
    : a.server === b.server && a.auth === b.auth && a.user.id === b.user.id && a.epoch === b.epoch;
}
export function connectionChanged(change: Change): void {
  listeners.forEach((listener) => listener(change));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(change);
    channel.close();
  }
}
export function onConnectionChange(listener: (change: Change) => void): () => void {
  listeners.add(listener);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  if (channel)
    channel.onmessage = (event) => {
      if (event.data === 'changed' || event.data === 'stop') listener(event.data);
    };
  return () => {
    listeners.delete(listener);
    channel?.close();
  };
}
