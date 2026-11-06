import type { AppData } from '../domain/types';
import type { Snapshot } from '../sync/model';

export type SyncProvider = 'none' | 'netlify' | 'opengym';
export interface OpenGymUser {
  id: string;
  name: string;
  admin: boolean;
  owner?: boolean;
}
export interface ServerConfig {
  invite_only: boolean;
  allow_guest: boolean;
  password_login?: boolean;
}
export type OpenGymState = Record<string, unknown>;
export interface OpenGymDocument {
  state: OpenGymState | null;
  rev: number;
}
export interface OpenGymConnection {
  /** A new identity for each login/pair; optional for existing local settings. */
  epoch?: string;
  server: string;
  user: OpenGymUser;
  auth: 'cookie' | 'bearer';
  base: Snapshot | null;
  lastSuccess: string | null;
}
export interface OpenGymSaved {
  version: 1;
  connection: OpenGymConnection | null;
  remote: OpenGymDocument | null;
}
export interface Workspace {
  data: AppData | null;
  status: string;
  writable: boolean;
  mutate(fn: (data: AppData) => AppData): Promise<boolean>;
}
export interface OwnerProof {
  current?: string;
  cid?: string;
  credential?: unknown;
}
