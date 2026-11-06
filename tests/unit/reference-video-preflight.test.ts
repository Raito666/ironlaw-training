import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  canLoadReferenceVideo,
  type ReferenceAsset,
} from "../../src/content/reference-cache";

const bytes = "synthetic-mp4-bytes";
const movie: ReferenceAsset = {
  url: "/exercise-media/synthetic.mp4",
  mime: "video/mp4",
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const valid = () =>
  new Response(bytes, { headers: { "Content-Type": "video/mp4" } });
function storage(response?: Response) {
  const cache = {
    match: vi.fn(async () => response?.clone()),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { cache, open: vi.fn(async () => cache) };
}
it("online playback and local iOS assets do not depend on browser CacheStorage", async () => {
  const unreadable = {
    open: vi.fn(async () => {
      throw new Error("not supported");
    }),
  };
  expect(
    await canLoadReferenceVideo(movie, {
      online: true,
      bundled: false,
      storage: unreadable,
    }),
  ).toBe(true);
  expect(
    await canLoadReferenceVideo(movie, {
      online: false,
      bundled: true,
      storage: unreadable,
    }),
  ).toBe(true);
  expect(unreadable.open).not.toHaveBeenCalled();
});
it("offline playback refuses a missing or unavailable cache", async () => {
  expect(
    await canLoadReferenceVideo(movie, { online: false, bundled: false }),
  ).toBe(false);
  expect(
    await canLoadReferenceVideo(movie, {
      online: false,
      bundled: false,
      storage: storage(),
    }),
  ).toBe(false);
});
it("offline playback accepts only exact MIME, complete bytes and pinned digest", async () => {
  const good = storage(valid());
  expect(
    await canLoadReferenceVideo(movie, {
      online: false,
      bundled: false,
      storage: good,
    }),
  ).toBe(true);
  expect(good.cache.put).not.toHaveBeenCalled();
  expect(good.cache.delete).not.toHaveBeenCalled();
});
for (const [label, response] of [
  [
    "wrong MIME",
    () => new Response(bytes, { headers: { "Content-Type": "text/html" } }),
  ],
  [
    "truncated",
    () =>
      new Response(bytes.slice(0, -1), {
        headers: { "Content-Type": "video/mp4" },
      }),
  ],
  [
    "wrong digest",
    () =>
      new Response("X" + bytes.slice(1), {
        headers: { "Content-Type": "video/mp4" },
      }),
  ],
] as const)
  it(`offline ${label} cannot start native loading or remove a concurrently repairable entry`, async () => {
    const cache = storage(response());
    expect(
      await canLoadReferenceVideo(movie, {
        online: false,
        bundled: false,
        storage: cache,
      }),
    ).toBe(false);
    expect(cache.cache.delete).not.toHaveBeenCalled();
  });
it("offline cache access errors fail closed without rewriting anything", async () => {
  expect(
    await canLoadReferenceVideo(movie, {
      online: false,
      bundled: false,
      storage: {
        open: async () => {
          throw new Error("blocked");
        },
      },
    }),
  ).toBe(false);
});
