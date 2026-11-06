import Presence from "../motion/Presence";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Exercise } from "../domain/types";
import {
  catalogEntries,
  guideFor,
  exerciseArt,
  mediaUrls,
  MEDIA_CACHE,
} from "../content/catalog";
import Icon from "../components/Icon";
import ChoiceSelect from "../components/ChoiceSelect";
import InlineChoiceScope from "../components/InlineChoiceScope";
import ExerciseDetails from "./ExerciseDetails";
import { cachedArtUrls, fetchArt } from "../content/art-cache";
import BodyAtlas from "../components/BodyAtlas";
import {
  matchesBodyTarget,
  targetLabel,
  muscleLabel,
  type BodyTarget,
} from "../content/body-map";
import { useListMotion } from "../motion/presentation";
import { useExerciseOptions } from "../content/use-exercise-options";
import {
  ensureExercises,
  isOpenGymExercise,
  loadOpenGymCatalogue,
  openGymEntryFor,
} from "../content/opengym-catalogue";
import {
  difficultyLevels,
  difficultyDefinitions,
  exerciseDifficulty,
  exerciseDifficultyInfo,
} from "../content/exercise-difficulty";

const EMPTY_IDS: string[] = [];
const equipmentLabel = (value: string) =>
  value === "器械" ? "固定器械" : value;
const searchText = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_/(),，（）]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export default function ExerciseLibrary({
  data,
  writable,
  mutate,
  onCreate,
  onUse,
  onCancelUse,
}: {
  data: AppData;
  writable: boolean;
  mutate: (fn: (data: AppData) => AppData) => Promise<boolean>;
  onCreate: () => void;
  onUse: (exercise: Exercise) => Promise<boolean>;
  onCancelUse: () => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const search = useRef<HTMLInputElement>(null);
  const browse = useRef<HTMLDivElement>(null);
  const {
    exercises,
    catalogue,
    loading: catalogueLoading,
    error: catalogueError,
    retry: retryCatalogue,
  } = useExerciseOptions(data.exercises);
  const offlinePanel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    let frame = 0;
    const openOffline = () => {
      if (
        new URLSearchParams(location.hash.split("?")[1] ?? "").get(
          "offline",
        ) !== "1"
      )
        return;
      frame = requestAnimationFrame(() => {
        if (!offlinePanel.current) return;
        offlinePanel.current.open = true;
        offlinePanel.current.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
        offlinePanel.current
          .querySelector("summary")
          ?.focus({ preventScroll: true });
      });
    };
    openOffline();
    window.addEventListener("hashchange", openOffline);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openOffline);
    };
  }, []);
  const [source, setSource] = useState("all");
  const [equipment, setEquipment] = useState("全部");
  const [kind, setKind] = useState("全部");
  const [view, setView] = useState("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [using, setUsing] = useState(false);
  const [useFailed, setUseFailed] = useState(false);
  const [bodyTarget, setBodyTarget] = useState<BodyTarget | null>(null);
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [level, setLevel] = useState("全部");
  const results = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [cached, setCached] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [cacheError, setCacheError] = useState("");
  const [checkingCache, setCheckingCache] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const favorites = data.settings.favoriteExerciseIds ?? EMPTY_IDS;
  const recent = useMemo(
    () =>
      new Set(
        data.sessions
          .filter((s) => s.status === "completed")
          .flatMap((s) =>
            s.exercises
              .filter((ex) => ex.sets.some((set) => set.status === "completed"))
              .map((ex) => ex.exercise.id),
          ),
      ),
    [data.sessions],
  );
  useEffect(() => {
    setPage(0);
  }, [
    query,
    equipment,
    kind,
    view,
    bodyTarget,
    includeSecondary,
    level,
    source,
  ]);
  useEffect(() => {
    let alive = true;
    if ("caches" in window)
      void caches
        .open(MEDIA_CACHE)
        .then(cachedArtUrls)
        .then((valid) => {
          if (alive) {
            setCached(valid.size);
            setCheckingCache(false);
            // Prioritize the directory over hundreds of background SVG downloads.
            // The catalogue loader shares its in-flight request with the hook.
            if (valid.size < mediaUrls.length)
              void loadOpenGymCatalogue()
                .catch(() => null)
                .then(() => {
                  if (alive) void cacheAll();
                });
          }
        })
        .catch(() => {
          if (alive)
            setCacheError("暂时无法检查离线图解，可继续阅读文字或重试保存。");
        })
        .finally(() => {
          if (alive) setCheckingCache(false);
        });
    else setCheckingCache(false);
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);
  function favorite(id: string) {
    void mutate((d) => {
      const ids = d.settings.favoriteExerciseIds ?? [];
      return {
        ...ensureExercises(
          d,
          exercises.filter((exercise) => exercise.id === id),
        ),
        settings: {
          ...d.settings,
          favoriteExerciseIds: ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids, id],
        },
      };
    });
  }
  const searchEntries = useMemo(
    () =>
      exercises.map((ex) => {
        const guide = guideFor(ex);
        const extended = openGymEntryFor(ex.id);
        const english = guide?.english ?? extended?.nameEn ?? "";
        const text = searchText(
          `${ex.name} ${ex.muscle} ${muscleLabel(ex)} ${ex.equipment} ${equipmentLabel(ex.equipment)} ${english} ${guide?.primary ?? ""} ${guide?.title ?? ""}`,
        );
        return {
          ex,
          guide: !!guide,
          extended: !!extended,
          names: [searchText(ex.name), searchText(english)],
          text,
          compact: text.replace(/\s/g, ""),
        };
      }),
    [exercises, catalogue],
  );
  const words = useMemo(
    () => searchText(deferredQuery).split(" ").filter(Boolean),
    [deferredQuery],
  );
  const equipmentOptions = useMemo(
    () =>
      [...new Set(exercises.map((ex) => equipmentLabel(ex.equipment)))].sort(
        (a, b) => a.localeCompare(b, "zh-CN"),
      ),
    [exercises],
  );
  const filtered = useMemo(
    () => {
      const exactName = words.join(" ");
      const priority = (entry: (typeof searchEntries)[number]) => {
        const extended = Number(isOpenGymExercise(entry.ex.id));
        // Keep the default catalogue order, but show the canonical match before its variants.
        return exactName && entry.names.includes(exactName) ? 3 - extended : extended;
      };
      return searchEntries
        .filter(({ ex, guide, extended, text, compact }) => {
          return (
            (source === "all" ||
              (source === "extended" && !!extended) ||
              (source === "original" && guide)) &&
            words.every(
              (word) => text.includes(word) || compact.includes(word),
            ) &&
            (equipment === "全部" ||
              equipmentLabel(ex.equipment) === equipment) &&
            (kind === "全部" || ex.kind === kind) &&
            (view === "all" ||
              (view === "favorites" && favorites.includes(ex.id)) ||
              (view === "recent" && recent.has(ex.id)) ||
              (view === "custom" && !guide && !isOpenGymExercise(ex.id)))
          );
        })
        .sort((a, b) => priority(b) - priority(a))
        .map(({ ex }) => ex);
    },
    [searchEntries, words, equipment, kind, view, favorites, recent, source],
  );
  const bodyMatches = useMemo(
    () =>
      bodyTarget
        ? filtered.filter((ex) =>
            matchesBodyTarget(ex, bodyTarget, includeSecondary),
          )
        : filtered,
    [filtered, bodyTarget, includeSecondary],
  );
  const difficultyCounts = useMemo(() => {
    const counts = new Map(difficultyLevels.map((item) => [item, 0]));
    for (const exercise of bodyMatches) {
      const difficulty = exerciseDifficulty(exercise);
      counts.set(difficulty, (counts.get(difficulty) ?? 0) + 1);
    }
    return counts;
  }, [bodyMatches]);
  const matches = useMemo(
    () =>
      level === "全部"
        ? bodyMatches
        : bodyMatches.filter(
            (exercise) => exerciseDifficulty(exercise) === level,
          ),
    [bodyMatches, level],
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matches.length / 24) - 1),
  );
  const atlasExercises = useMemo(
    () =>
      level === "全部"
        ? filtered
        : filtered.filter((ex) => exerciseDifficulty(ex) === level),
    [filtered, level],
  );
  const visible = matches.slice(currentPage * 24, (currentPage + 1) * 24);
  const equipmentGroups = useMemo(() => {
    const groups = new Map<
      string,
      { equipment: string; total: number; exercises: Exercise[] }
    >();
    matches.forEach((exercise, index) => {
      const equipment = equipmentLabel(exercise.equipment);
      let group = groups.get(equipment);
      if (!group) {
        group = { equipment, total: 0, exercises: [] };
        groups.set(equipment, group);
      }
      group.total++;
      if (index >= currentPage * 24 && index < (currentPage + 1) * 24)
        group.exercises.push(exercise);
    });
    return groups;
  }, [matches, currentPage]);
  useListMotion(
    list,
    JSON.stringify([
      query,
      source,
      equipment,
      kind,
      view,
      bodyTarget,
      includeSecondary,
      level,
      currentPage,
    ]),
    ":scope > .equipment-group > .equipment-grid > .movement-card",
  );
  async function cacheAll() {
    if (!("caches" in window)) {
      setCacheError("当前浏览器不支持图解缓存，文字讲解仍可使用。");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setDownloading(true);
    setCacheError("");
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const valid = await cachedArtUrls(cache);
      let next = 0;
      let done = valid.size;
      setCached(done);
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (next < mediaUrls.length && !controller.signal.aborted) {
            const url = mediaUrls[next++];
            if (!valid.has(url)) {
              const response = await fetchArt(url, controller.signal);
              await cache.put(url, response);
              done++;
              if (
                !controller.signal.aborted &&
                (done % 6 === 0 || done === mediaUrls.length)
              )
                setCached(done);
            }
          }
        }),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        controller.abort();
        setCacheError(
          error instanceof Error ? error.message : "缓存未完成，请重试",
        );
      }
    } finally {
      setDownloading(false);
      abort.current = null;
    }
  }
  const reset = () => {
    setQuery("");
    setEquipment("全部");
    setKind("全部");
    setView("all");
    setBodyTarget(null);
    setLevel("全部");
    setIncludeSecondary(false);
    setSource("all");
  };
  const chips: { id: string; label: string; clear: () => void }[] = [];
  if (query.trim())
    chips.push({
      id: "query",
      label: `搜索：${query}`,
      clear: () => setQuery(""),
    });
  if (bodyTarget)
    chips.push({
      id: "body",
      label: targetLabel(bodyTarget),
      clear: () => setBodyTarget(null),
    });
  if (equipment !== "全部")
    chips.push({
      id: "equipment",
      label: equipment,
      clear: () => setEquipment("全部"),
    });
  if (level !== "全部")
    chips.push({
      id: "level",
      label:
        difficultyDefinitions[level as keyof typeof difficultyDefinitions]
          .label,
      clear: () => setLevel("全部"),
    });
  if (kind !== "全部")
    chips.push({
      id: "kind",
      label:
        kind === "weight-reps"
          ? "重量与次数"
          : kind === "reps"
            ? "次数"
            : "时长",
      clear: () => setKind("全部"),
    });
  if (source !== "all")
    chips.push({
      id: "source",
      label: source === "extended" ? "扩展图文" : "原有图解",
      clear: () => setSource("all"),
    });
  if (view !== "all")
    chips.push({
      id: "view",
      label:
        view === "favorites" ? "收藏" : view === "recent" ? "练过" : "自定义",
      clear: () => setView("all"),
    });
  function changePage(next: number) {
    setPage(next);
    browse.current?.scrollIntoView({ block: "start", behavior: "instant" });
    browse.current?.focus({ preventScroll: true });
  }
  return (
    <div className="library-page">
      <section className="library-intro">
        <div>
          <p
            title={`${catalogEntries.length} 个图解动作${catalogue ? ` · ${catalogue.counts.canonicalEntries} 个扩展动作` : ""}`}
          >
            {catalogEntries.length} 个图解动作
            {catalogue &&
              ` · ${catalogue.counts.canonicalEntries} 个扩展动作`}
            <span className="library-intro-detail"> · 训练时按需加入本机</span>
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={!writable}
          onClick={onCreate}
        >
          <Icon name="plus" size={16} />
          自定义动作
        </button>
      </section>
      {catalogueLoading && (
        <p className="library-catalogue-status wrap-cjk" role="status">
          正在载入扩展动作目录，先显示本机已有动作。载入后可搜索完整目录和动作步骤。
        </p>
      )}
      {catalogue && (
        <p className="library-catalogue-status wrap-cjk" role="status">
          已载入 {catalogue.counts.canonicalEntries} 个扩展动作及文字讲解。
          图解动作可在「原有图解动作」中查看。
        </p>
      )}
      {catalogueError && (
        <p className="notice" role="status">
          {catalogueError}{" "}
          <button className="text-button" onClick={retryCatalogue}>
            重试目录
          </button>
        </p>
      )}
      <div className="library-toolbar">
        <label className="library-search">
          <Icon name="search" size={20} />
          <span className="sr-only">搜索动作</span>
          <input
            ref={search}
            aria-label="搜索动作"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索动作、英文名或目标肌群…"
            type="search"
          />
          {query && (
            <button
              type="button"
              className="library-search-clear"
              aria-label="清空搜索"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <div className="segmented" role="group" aria-label="动作收藏筛选">
          {[
            ["all", "全部"],
            ["favorites", "收藏"],
            ["recent", "练过"],
            ["custom", "自定义"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="body-filter">
        <div className="body-filter-toggle">
          <span className="truncate">
            按身体部位筛选{bodyTarget ? ` · ${targetLabel(bodyTarget)}` : ""}
          </span>
        </div>
        <div id="library-body-filter">
          <BodyAtlas
            exercises={atlasExercises}
            selected={bodyTarget}
            includeSecondary={includeSecondary}
            onSelect={(id) => {
              setBodyTarget(id);
            }}
            onSecondary={setIncludeSecondary}
            onResults={() => {
              results.current?.scrollIntoView({
                block: "start",
                behavior: "instant",
              });
              results.current?.focus({ preventScroll: true });
            }}
          />
        </div>
      </section>
      <div ref={results} tabIndex={-1} className="library-filter-line">
        <div className="filter-panel-heading">
          <h2>
            <Icon name="settings" size={18} />
            动作筛选
          </h2>
          <span className="filter-panel-count">
            {chips.length ? `${chips.length} 项条件` : "不限条件"}
          </span>
        </div>
        <InlineChoiceScope className="library-choice-grid">
          <ChoiceSelect
            label="动作来源"
            icon="book"
            showLabel
            value={source}
            onChange={setSource}
            active={source !== "all"}
            options={[
              {
                value: "all",
                label: "全部来源",
                description: "同时浏览原有图解、扩展动作与个人动作。",
              },
              {
                value: "extended",
                label: "扩展动作",
                description: "浏览扩展目录的动作要点、步骤及来源。",
              },
              {
                value: "original",
                label: "原有图解动作",
                description:
                  "浏览原有SVG图解动作。个人动作可在全部来源中查看。",
              },
            ]}
          />
          <ChoiceSelect
            label="器械"
            icon="dumbbell"
            showLabel
            value={equipment}
            onChange={setEquipment}
            active={equipment !== "全部"}
            options={[
              { value: "全部", label: "不限器械" },
              ...equipmentOptions.map((eq) => ({ value: eq, label: eq })),
            ]}
          />
          <ChoiceSelect
            label="技术难度"
            icon="chart"
            showLabel
            value={level}
            onChange={setLevel}
            active={level !== "全部"}
            describedBy="library-difficulty-help"
            options={[
              {
                value: "全部",
                label: "不限难度",
                description: "技术要求参考，不等于体能、重量或用力程度。",
              },
              ...difficultyLevels.map((item) => ({
                value: item,
                label: difficultyDefinitions[item].label,
                description: difficultyDefinitions[item].description,
                meta: `${difficultyCounts.get(item) ?? 0} 个动作`,
                disabled: !difficultyCounts.get(item) && level !== item,
              })),
            ]}
          />
          <ChoiceSelect
            label="记录方式"
            icon="edit"
            showLabel
            value={kind}
            onChange={setKind}
            active={kind !== "全部"}
            options={[
              { value: "全部", label: "不限记录方式" },
              {
                value: "weight-reps",
                label: "重量与次数",
                description: "每组记录总外部负重与实际次数。",
              },
              {
                value: "reps",
                label: "次数",
                description: "记录实际完成次数，不推算重量容量。",
              },
              {
                value: "duration",
                label: "时长",
                description: "按秒记录持续时间。",
              },
            ]}
          />
        </InlineChoiceScope>
        <p className="library-filter-summary" aria-live="polite">
          <strong>{matches.length}</strong> 个动作
          {bodyTarget && (
            <span className="selected-body-label">
              {" "}
              · {targetLabel(bodyTarget)}
            </span>
          )}
          {(query ||
            equipment !== "全部" ||
            kind !== "全部" ||
            view !== "all" ||
            source !== "all" ||
            bodyTarget ||
            level !== "全部") && (
            <button className="text-button" onClick={reset}>
              重置筛选
            </button>
          )}
        </p>
      </div>
      <p
        id="library-difficulty-help"
        className="library-difficulty-help wrap-cjk"
      >
        {level === "未标注"
          ? "个人或专项动作暂不自动分级，不代表简单或困难。"
          : "按动作控制要求提供参考分级，不等于体能等级、训练重量或用力程度。具体依据可在动作讲解中查看。"}
      </p>
      <details className="library-difficulty-guide">
        <summary>技术难度怎么分？</summary>
        <dl>
          {difficultyLevels.map((item) => (
            <div key={item}>
              <dt>{difficultyDefinitions[item].label}</dt>
              <dd>{difficultyDefinitions[item].description}</dd>
            </div>
          ))}
        </dl>
        <p>
          扩展资料没有官方难度字段，参考等级由项目按动作类型整理；未命中明确类型的动作暂列进阶并标为“待确认”，不冒充逐条专业评定。
        </p>
      </details>
      {chips.length > 0 && (
        <div className="library-active-filters" aria-label="已选筛选条件">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              title={`移除${chip.label}`}
              aria-label={`移除${chip.label}`}
              onClick={chip.clear}
            >
              <span className="truncate">{chip.label}</span>
              <Icon name="close" size={14} />
            </button>
          ))}
        </div>
      )}
      <div
        className="library-browse-bar"
        ref={browse}
        tabIndex={-1}
        aria-busy={query !== deferredQuery || catalogueLoading}
      >
        <p aria-live="polite">
          {query !== deferredQuery
            ? "正在更新结果…"
            : `${matches.length} 个动作${matches.length > 24 ? ` · 第 ${currentPage + 1} 页` : ""}`}
        </p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            results.current?.scrollIntoView({
              block: "start",
              behavior: "instant",
            });
            results.current?.focus({ preventScroll: true });
          }}
        >
          调整筛选
          <Icon name="up" size={16} />
        </button>
      </div>
      {matches.length ? (
        <>
          <div className="movement-grid movement-groups" ref={list}>
            {[...equipmentGroups.values()]
              .filter((group) => group.exercises.length > 0)
              .map((group) => (
                <section
                  className="equipment-group"
                  aria-label={`${group.equipment}动作分组`}
                  key={group.equipment}
                >
                  <div className="equipment-heading">
                    <h2 className="wrap-cjk">{group.equipment}</h2>
                    <span className="equipment-count">
                      {group.exercises.length < group.total
                        ? `已显示 ${group.exercises.length} / ${group.total}`
                        : `${group.total} 个动作`}
                    </span>
                  </div>
                  <div className="equipment-grid">
                    {group.exercises.map((ex) => {
                      const guide = guideFor(ex);
                      const extended = openGymEntryFor(ex.id);
                      const difficulty = exerciseDifficultyInfo(ex);
                      return (
                        <article className="movement-card" key={ex.id}>
                          <button
                            className="movement-open"
                            aria-label={`查看${ex.name}讲解`}
                            onClick={() => setDetail(ex)}
                          >
                            <div
                              className={`movement-art ${!guide ? "custom" : ""}`}
                            >
                              {guide ? (
                                <img
                                  src={exerciseArt(ex.id, 2)}
                                  alt=""
                                  loading="lazy"
                                  width="256"
                                  height="256"
                                />
                              ) : (
                                <Icon name="dumbbell" size={24} />
                              )}
                              <span className="movement-kind">
                                {ex.kind === "weight-reps"
                                  ? "力量"
                                  : guide?.stretch
                                    ? "舒展"
                                    : ex.kind === "duration"
                                      ? "时长"
                                      : "自重"}
                              </span>
                              {(guide || extended) && (
                                <span
                                  className="movement-guide-badge"
                                  aria-hidden="true"
                                >
                                   {guide ? "讲解" : "文字讲解"}
                                </span>
                              )}
                            </div>
                            <div className="movement-info">
                              <h3
                                className="line-clamp-2 wrap-cjk"
                                title={ex.name}
                              >
                                {ex.name}
                              </h3>
                              <p className="truncate">
                                {guide?.english ??
                                  extended?.nameEn ??
                                  "个人动作"}
                              </p>
                              <span>
                                <span
                                  className="truncate"
                                  title={muscleLabel(ex)}
                                >
                                  {muscleLabel(ex)}
                                </span>
                                <i />
                                <span className="truncate" title={ex.equipment}>
                                  {ex.equipment}
                                </span>
                              </span>
                              <small className="movement-level-label">
                                {difficultyDefinitions[difficulty.level].label}
                                {difficulty.source === "general-reference"
                                  ? " · 待确认"
                                  : difficulty.source === "unrated"
                                    ? ""
                                    : " · 参考"}
                              </small>
                            </div>
                          </button>
                          {guide && (
                            <details className="movement-quick">
                              <summary>要点速查</summary>
                              <ol className="wrap-cjk">
                                {guide.quickSteps.map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ol>
                              <button
                                className="text-button"
                                onClick={() => setDetail(ex)}
                              >
                                查看完整讲解
                              </button>
                            </details>
                          )}
                          {extended && (
                            <details className="movement-quick">
                              <summary>要点速读</summary>
                              <ol className="wrap-cjk">
                                {(extended.instructionsZh.length
                                  ? extended.instructionsZh
                                  : difficulty.cues
                                )
                                  .slice(0, 2)
                                  .map((step, index) => (
                                    <li key={index}>{step}</li>
                                  ))}
                              </ol>
                              {!extended.instructionsZh.length && (
                                <p className="library-type-note">
                                  中文为动作类型提示，完整原文保留在详情。
                                </p>
                              )}
                              <button
                                className="text-button"
                                onClick={() => setDetail(ex)}
                              >
                                查看完整讲解
                              </button>
                            </details>
                          )}
                          <button
                            className={`favorite-button ${favorites.includes(ex.id) ? "active" : ""}`}
                            disabled={!writable}
                            aria-label={`${favorites.includes(ex.id) ? "取消收藏" : "收藏"}${ex.name}${extended ? "（扩展图文）" : ""}`}
                            aria-pressed={favorites.includes(ex.id)}
                            onClick={() => favorite(ex.id)}
                          >
                            <Icon name="heart" size={20} />
                            <span>
                              {favorites.includes(ex.id)
                                ? "已收藏"
                                : "收藏动作"}
                            </span>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
          </div>
          {matches.length > 24 && (
            <div className="load-more">
              <button
                className="btn btn-secondary"
                disabled={!currentPage}
                onClick={() => changePage(currentPage - 1)}
              >
                上一页
              </button>
              <span aria-live="polite">
                第 {currentPage + 1} / {Math.ceil(matches.length / 24)} 页 ·
                本页 {visible.length} / 共 {matches.length} 个
              </span>
              <button
                className="btn btn-secondary"
                disabled={(currentPage + 1) * 24 >= matches.length}
                onClick={() => changePage(currentPage + 1)}
              >
                继续浏览 · 下一页
                <Icon name="down" size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card empty-state">
          <Icon name="search" size={24} />
          <h2>
            {catalogueLoading
              ? "扩展动作目录正在载入"
              : view === "favorites"
                ? "把常练的动作放在这里。"
                : view === "recent"
                  ? "你的动作足迹，从第一组开始。"
                  : "没有找到这个动作"}
          </h2>
          <p>
            {catalogueLoading
              ? "载入后会继续当前搜索和筛选，无需重新输入。"
              : level !== "全部"
                ? "当前组合没有这一难度的动作，可取消难度条件，保留其他筛选。"
                : "调整部位或器械，或创建自己的动作。"}
          </p>
          <div className="row">
            {level !== "全部" && (
              <button
                className="btn btn-secondary"
                onClick={() => setLevel("全部")}
              >
                不限难度
              </button>
            )}
            <button className="btn btn-secondary" onClick={reset}>
              清空筛选
            </button>
            <button
              className="btn btn-primary"
              disabled={!writable}
              onClick={onCreate}
            >
              自定义动作
            </button>
          </div>
        </div>
      )}

      <details className="offline-library" ref={offlinePanel}>
        <summary>
          <span>
            <Icon name="download" size={16} />
            离线图解准备
          </span>
          <small>
            {checkingCache
              ? "正在检查缓存…"
              : cacheError
                ? `准备未完成 · ${cached} / ${mediaUrls.length}`
                : cached >= mediaUrls.length
                  ? "全部图解已校验"
                  : `${cached} / ${mediaUrls.length} 张已校验`}
          </small>
        </summary>
        <p>
          进入动作页后自动准备全部{mediaUrls.length}张图解，约26
          MB，可暂停和继续。显示全部就绪后，三帧都能离线查看；缓存由当前浏览器管理。
        </p>
        <div className="row wrap">
          <button
            className="btn btn-secondary"
            disabled={
              checkingCache || downloading || cached >= mediaUrls.length
            }
            onClick={() => void cacheAll()}
          >
            {downloading
              ? `正在保存 ${cached} / ${mediaUrls.length}`
              : cached >= mediaUrls.length
                ? "全部图解已就绪"
                : "保存全部图解供离线使用"}
          </button>
          {downloading && (
            <button
              className="btn btn-ghost"
              onClick={() => abort.current?.abort()}
            >
              暂停下载
            </button>
          )}
        </div>
        {cacheError && (
          <p role="alert" className="error-text">
            {cacheError}
          </p>
        )}
      </details>

      <Presence>
        {detail && (
          <ExerciseDetails
            exercise={detail}
            data={data}
            onClose={() => {
              if (!using)
                void onCancelUse().then((ok) => {
                  if (ok) {
                    setUseFailed(false);
                    setDetail(null);
                  }
                });
            }}
            onFavorite={
              writable && !using && !useFailed
                ? () => favorite(detail.id)
                : undefined
            }
            favorite={favorites.includes(detail.id)}
            actionBusy={using}
            actionError={
              useFailed
                ? "动作尚未保存，可以重试或关闭取消；不会重复追加。"
                : ""
            }
            onUse={
              writable
                ? async () => {
                    if (using) return;
                    setUsing(true);
                    try {
                      const ok = await onUse(detail);
                      setUseFailed(!ok);
                      if (ok) setDetail(null);
                    } finally {
                      setUsing(false);
                    }
                  }
                : undefined
            }
          />
        )}
      </Presence>
    </div>
  );
}
