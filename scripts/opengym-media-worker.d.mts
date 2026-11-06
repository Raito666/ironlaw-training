import type { ReferenceAssetSpec } from './reference-worker.mjs';
export interface OpenGymMediaAsset extends ReferenceAssetSpec { width: number; height: number }
export interface OpenGymMediaEntry {
  id: string;
  canonicalId: string;
  still: OpenGymMediaAsset & { mime: 'image/webp' };
  clip: OpenGymMediaAsset & { mime: 'video/mp4'; duration: number };
}
export interface OpenGymMediaManifest {
  formatVersion: 1;
  source: { project: 'openGym'; revision: string; noticePath: '/exercise-catalogue/opengym-NOTICE.md' };
  entries: OpenGymMediaEntry[];
}
export interface OpenGymMediaIndex {
  url: '/exercise-catalogue/opengym-media.json';
  bytes: number;
  sha256: string;
  sourceRecords: number;
  stills: number;
  clips: number;
  totalBytes: number;
}
export interface OpenGymMediaStorage {
  open(name: string): Promise<{
    match(url: string, options?: { ignoreVary?: boolean }): Promise<Response | undefined>;
    put(url: string, response: Response): Promise<void>;
  }>;
}
export const OPENGYM_MEDIA_CACHE: string;
export const OPENGYM_MEDIA_MANIFEST_CACHE: string;
export const OPENGYM_MEDIA_PREFIX: string;
export function validateOpenGymMediaManifest(value: unknown): OpenGymMediaManifest;
export function validateOpenGymMediaIndex(value: unknown): OpenGymMediaIndex;
export function readPinnedOpenGymMediaManifest(index: OpenGymMediaIndex, options?: {
  storage?: OpenGymMediaStorage;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}): Promise<OpenGymMediaManifest>;
export function openGymMediaWorkerSource(index: OpenGymMediaIndex): string;
