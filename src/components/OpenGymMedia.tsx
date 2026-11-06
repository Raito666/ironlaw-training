import { useCallback, useEffect, useRef, useState } from "react";
import ChoiceSelect from "./ChoiceSelect";
import InlineChoiceScope from "./InlineChoiceScope";
import {
  canLoadOpenGymVideo,
  ensureOpenGymMediaManifestOffline,
  loadOpenGymMediaManifest,
  openGymMediaCacheState,
  openGymMediaManifestCacheReady,
  openGymMediaOfflineAvailable,
  openGymMediaStorage,
  openGymMediaVariants,
  openGymStillUrl,
  prepareOpenGymMedia,
  type OpenGymMediaEntry,
  type OpenGymMediaManifest,
} from "../content/opengym-media";
import { isIos, watchNativeActivity } from "../platform/native";

type MediaProps = { exerciseId: string; name: string };
const formatBytes = (bytes: number) =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.ceil(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;

/** No manifest request on catalogue cards. Preserve original source colors and whole frame. */
export function OpenGymThumbnail({ exerciseId, name }: MediaProps) {
  const url = openGymStillUrl(exerciseId);
  const [failedUrl, setFailedUrl] = useState("");
  if (!url) return null;
  return (
    <span className="opengym-thumbnail">
      {failedUrl === url ? (
        <span className="opengym-thumbnail-unavailable">图片暂不可用</span>
      ) : (
        <img
          src={url}
          alt={`${name}来源示范图`}
          loading="lazy"
          decoding="async"
          width={180}
          height={180}
          onError={() => setFailedUrl(url)}
        />
      )}
    </span>
  );
}

function SourceCredit() {
  return (
    <p className="opengym-media-credit">
      素材画面署名 © Aliaksandr Makatserchyk / Gym visual。保留原始画面。
      <a
        href="/exercise-catalogue/opengym-NOTICE.md"
        target="_blank"
        rel="noreferrer"
      >
        查看来源与素材许可说明
      </a>
      <span>素材说明与应用、文字的 AGPL 许可分别列示。</span>
    </p>
  );
}

function SelectedMedia({
  entry,
  name,
}: {
  entry: OpenGymMediaEntry;
  name: string;
}) {
  const [pictureError, setPictureError] = useState(false);
  const [pictureAttempt, setPictureAttempt] = useState(0);
  const [videoRequested, setVideoRequested] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [mode, setMode] = useState<"still" | "video">("still");
  const [speed, setSpeed] = useState("1");
  const [repeat, setRepeat] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playNotice, setPlayNotice] = useState("");
  const playIntent = useRef(false);
  const [cacheState, setCacheState] = useState<
    "checking" | "idle" | "saving" | "ready" | "error"
  >("checking");
  const [cached, setCached] = useState(0);
  const [offlineReady, setOfflineReady] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const playbackVersion = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    if (!node && video.current) {
      video.current.pause();
      video.current.removeAttribute("src");
      video.current.load();
    }
    if (node) node.muted = true;
    video.current = node;
  }, []);
  const region = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const bundled = isIos();
  const storage = openGymMediaStorage();

  useEffect(() => {
    alive.current = true;
    const pause = () => {
      playIntent.current = false;
      video.current?.pause();
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") pause();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pause);
    const stopNative = watchNativeActivity((active) => {
      if (!active) pause();
    });
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver((entries) => {
            if (entries.some((item) => !item.isIntersecting)) pause();
          });
    if (region.current) observer?.observe(region.current);
    return () => {
      alive.current = false;
      playbackVersion.current++;
      controller.current?.abort();
      pause();
      observer?.disconnect();
      stopNative();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pause);
    };
  }, []);

  useEffect(() => {
    if (
      mode !== "video" ||
      !videoRequested ||
      !video.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        playIntent.current = false;
        video.current?.pause();
      }
    });
    observer.observe(video.current);
    return () => observer.disconnect();
  }, [mode, videoRequested]);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const [state, worker, manifest] = await Promise.all([
          openGymMediaCacheState(entry, storage),
          bundled ? Promise.resolve(true) : openGymMediaOfflineAvailable(entry),
          bundled
            ? Promise.resolve(true)
            : openGymMediaManifestCacheReady(storage),
        ]);
        if (!active) return;
        setCached(state.cached);
        setCacheState(state.ready ? "ready" : "idle");
        setOfflineReady(worker && manifest);
      } catch {
        if (active) {
          setCacheState("idle");
          setOfflineReady(false);
        }
      }
    }
    void check();
    const recheck = () => {
      if (!controller.current) void check();
    };
    window.addEventListener("online", recheck);
    window.addEventListener("offline", recheck);
    navigator.serviceWorker?.addEventListener("controllerchange", recheck);
    return () => {
      active = false;
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", recheck);
      navigator.serviceWorker?.removeEventListener("controllerchange", recheck);
    };
  }, [entry, storage, bundled]);

  async function save() {
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setCacheState("saving");
    try {
      if (!bundled) await ensureOpenGymMediaManifestOffline(abort.signal);
      await prepareOpenGymMedia(entry, {
        storage,
        bundled,
        signal: abort.signal,
        onProgress: (count) => {
          if (alive.current) setCached(count);
        },
      });
      if (!bundled && !(await openGymMediaManifestCacheReady(storage)))
        throw new Error("离线目录已被移除，请重新保存。");
      const supported = bundled || (await openGymMediaOfflineAvailable(entry));
      abort.signal.throwIfAborted();
      if (alive.current) {
        setOfflineReady(supported);
        setCacheState("ready");
      }
    } catch (reason) {
      if (alive.current) {
        setCacheState(
          reason instanceof Error && reason.name === "AbortError"
            ? "idle"
            : "error",
        );
        setError(
          reason instanceof Error && reason.name === "AbortError"
            ? "已取消。已完成校验的文件保留，可继续保存。"
            : `保存未完成：${reason instanceof Error ? reason.message : "请检查本机服务与可用空间后重试。"}`,
        );
      }
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }

  async function requestVideo() {
    const version = ++playbackVersion.current;
    setMode("video");
    setPlayNotice("");
    playIntent.current = true;
    if (videoRequested && !videoError && video.current) {
      requestAnimationFrame(() => {
        if (alive.current && playbackVersion.current === version) {
          playIntent.current = false;
          play();
        }
      });
      return;
    }
    setVideoRequested(false);
    setVideoLoading(true);
    setVideoError("");
    try {
      const available = await canLoadOpenGymVideo(entry, {
        bundled,
        storage,
        online: navigator.onLine,
      });
      if (!alive.current || playbackVersion.current !== version) return;
      if (!available) {
        playIntent.current = false;
        setVideoError(
          "此版本尚未完整保存，或离线服务未就绪。请联网后重试或切换示范版本。",
        );
        return;
      }
      setBuffering(true);
      setVideoRequested(true);
    } catch {
      if (alive.current && playbackVersion.current === version) {
        playIntent.current = false;
        setVideoError("暂时无法载入视频，请重试；图片和文字仍可阅读。");
      }
    } finally {
      if (alive.current && playbackVersion.current === version)
        setVideoLoading(false);
    }
  }

  function showPicture() {
    playbackVersion.current++;
    playIntent.current = false;
    video.current?.pause();
    setVideoLoading(false);
    setMode("still");
  }

  function play(restart = false) {
    const node = video.current;
    if (!node) return;
    const version = playbackVersion.current;
    if (restart) node.currentTime = 0;
    node.playbackRate = Number(speed);
    setPlayNotice("");
    void node.play().catch((reason) => {
      if (
        !alive.current ||
        video.current !== node ||
        playbackVersion.current !== version ||
        reason?.name === "AbortError"
      )
        return;
      setBuffering(false);
      setPlayNotice("请点视频画面中的播放按钮继续。");
    });
  }

  return (
    <section
      className="opengym-selected-media"
      ref={region}
      aria-label={`${name}来源编号 ${entry.id} 的示范`}
    >
      <div
        className="opengym-view-controls"
        role="group"
        aria-label="示范画面选择"
      >
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={mode === "still"}
          onClick={showPicture}
        >
          动作图片
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={mode === "video"}
          disabled={videoLoading}
          onClick={() => void requestVideo()}
        >
          视频示范
        </button>
      </div>
      <figure className="opengym-still" hidden={mode !== "still"}>
        {pictureError ? (
          <div className="opengym-media-unavailable">
            <p>此版本图片暂不可用，动作文字仍可阅读。</p>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setPictureAttempt((value) => value + 1);
                setPictureError(false);
              }}
            >
              重试图片
            </button>
          </div>
        ) : (
          <img
            key={pictureAttempt}
            src={entry.still.url}
            alt={`${name}来源编号 ${entry.id} 的原始示范图`}
            width={entry.still.width}
            height={entry.still.height}
            loading="lazy"
            decoding="async"
            onError={() => setPictureError(true)}
          />
        )}
        <figcaption>原始图片 · 来源编号 {entry.id}</figcaption>
      </figure>
      <div className="opengym-video" hidden={mode !== "video"}>
        {videoRequested && !videoError ? (
          <>
            <video
              ref={attachVideo}
              src={entry.clip.url}
              poster={entry.still.url}
              width={entry.clip.width}
              height={entry.clip.height}
              controls
              playsInline
              preload="metadata"
              muted
              loop={repeat}
              aria-label={`${name}来源编号 ${entry.id} 的动作视频`}
              onLoadStart={() => setBuffering(true)}
              onWaiting={() => setBuffering(true)}
              onCanPlay={() => {
                setBuffering(false);
                if (playIntent.current) {
                  playIntent.current = false;
                  if (
                    !window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                  )
                    play();
                  else
                    setPlayNotice(
                      "已按减少动态效果偏好暂停，点视频中的播放按钮开始。",
                    );
                }
              }}
              onPlaying={() => {
                setBuffering(false);
                setPlayNotice("");
              }}
              onError={() => {
                playIntent.current = false;
                setBuffering(false);
                setVideoError(
                  "此视频暂时无法播放，可重试或切换示范版本；图片与文字不受影响。",
                );
              }}
            />
            {buffering && (
              <p className="opengym-media-note" role="status">
                视频缓冲中，网络较慢时可稍候或先查看图片。
              </p>
            )}
            <InlineChoiceScope className="opengym-playback-tools">
              <div className="choice-label-group">
                播放速度
                <ChoiceSelect
                  label="示范视频播放速度"
                  icon="play"
                  compact
                  value={speed}
                  onChange={(next) => {
                    setSpeed(next);
                    if (video.current)
                      video.current.playbackRate = Number(next);
                  }}
                  options={[
                    { value: "0.5", label: "0.5× 慢放" },
                    { value: "0.75", label: "0.75×" },
                    { value: "1", label: "1× 正常" },
                    { value: "1.25", label: "1.25×" },
                  ]}
                />
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                aria-pressed={repeat}
                onClick={() => setRepeat((value) => !value)}
              >
                循环示范{repeat ? "：开" : "：关"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => play(true)}
              >
                重新播放
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={showPicture}
              >
                收起视频
              </button>
            </InlineChoiceScope>
          </>
        ) : (
          <button
            className="btn btn-secondary opengym-video-load"
            type="button"
            disabled={videoLoading}
            aria-busy={videoLoading}
            onClick={() => void requestVideo()}
          >
            {videoLoading
              ? "正在检查视频…"
              : `${videoError ? "重试" : "载入"}动作视频 · ${formatBytes(entry.clip.bytes)}`}
          </button>
        )}
        <p className="opengym-media-note">
          约 {Math.round(entry.clip.duration)} 秒 ·{" "}
          {formatBytes(entry.clip.bytes)} · 默认静音，保留原生播放控件。
        </p>
        {playNotice && (
          <p className="opengym-media-note" role="status">
            {playNotice}
          </p>
        )}
        {videoError && (
          <p role="alert" className="error-text">
            {videoError}
          </p>
        )}
      </div>
      <div
        className="opengym-media-offline"
        aria-busy={cacheState === "saving" || cacheState === "checking"}
      >
        <div className="row wrap">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={
              cacheState === "saving" ||
              cacheState === "checking" ||
              (cacheState === "ready" && offlineReady) ||
              (!storage && !bundled)
            }
            onClick={() => void save()}
          >
            {cacheState === "saving"
              ? `正在${bundled ? "校验" : "保存"} ${cached} / 2`
              : cacheState === "checking"
                ? "正在检查离线文件…"
                : cacheState === "ready"
                  ? offlineReady
                    ? "图片与视频已校验，可离线查看"
                    : "文件已保存，重试检查离线服务"
                  : bundled
                    ? "校验本机示范文件"
                    : "保存此版本图片与视频供离线使用"}
          </button>
          {cacheState === "saving" && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => controller.current?.abort()}
            >
              取消保存
            </button>
          )}
        </div>
        <p role="status" className="opengym-media-note">
          {cacheState === "ready" && !offlineReady
            ? "文件已校验，当前离线服务尚未就绪。请先保存训练，关闭旧页面后重新打开。"
            : bundled
              ? "使用随应用提供的本机文件；无需浏览器缓存。"
              : `保存仅此版本约 ${formatBytes(entry.still.bytes + entry.clip.bytes)}，已校验 ${cached} / 2。已保存文件可离线使用，清理浏览器缓存后需重新保存。`}
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
      <SourceCredit />
    </section>
  );
}

function OpenGymMediaView({ exerciseId, name }: MediaProps) {
  const [manifest, setManifest] = useState<OpenGymMediaManifest>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState(exerciseId.slice(3));
  useEffect(() => {
    let alive = true;
    setError("");
    void loadOpenGymMediaManifest()
      .then((value) => {
        if (alive) setManifest(value);
      })
      .catch((reason) => {
        if (alive)
          setError(
            reason instanceof Error ? reason.message : "示范目录暂不可用。",
          );
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const variants = manifest ? openGymMediaVariants(manifest, exerciseId) : [];
  const selected =
    variants.find((entry) => entry.id === selectedId) ?? variants[0];
  return (
    <section
      className="opengym-media wrap-cjk"
      aria-label={`${name}图片与视频示范`}
    >
      <div className="opengym-media-heading">
        <h3>图片与视频示范</h3>
        <span>原始图片与轻量视频</span>
      </div>
      {!manifest ? (
        <div className="opengym-media-status" aria-busy={!error}>
          <p role={error ? "alert" : "status"}>
            {error || "正在载入示范目录…"}
          </p>
          {error && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试示范目录
            </button>
          )}
        </div>
      ) : !selected ? (
        <p role="status">此来源编号暂无本机示范；动作文字仍可阅读。</p>
      ) : (
        <>
          {variants.length > 1 && (
            <InlineChoiceScope className="opengym-variant-control">
              <span>示范版本</span>
              <ChoiceSelect
                label="示范版本"
                icon="play"
                value={selected.id}
                onChange={setSelectedId}
                options={variants.map((entry) => ({
                  value: entry.id,
                  label: `来源编号 ${entry.id}`,
                  description:
                    entry.id === entry.canonicalId
                      ? "主条目"
                      : "同条目素材版本",
                }))}
              />
            </InlineChoiceScope>
          )}
          <SelectedMedia key={selected.id} entry={selected} name={name} />
        </>
      )}
    </section>
  );
}

export function OpenGymMedia(props: MediaProps) {
  return <OpenGymMediaView key={props.exerciseId} {...props} />;
}
export default OpenGymMedia;
