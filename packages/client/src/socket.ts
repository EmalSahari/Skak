import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@skak/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

export const socket: AppSocket = io(serverUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
