import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@skak/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function serverUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // In the Vite dev server the API lives on :3001; in a production build the
  // server serves this app, so connect back to the same origin (undefined).
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3001`;
  }
  return undefined;
}

export const socket: AppSocket = io(serverUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
