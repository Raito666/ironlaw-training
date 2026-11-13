import { muscleLabel } from "../content/body-map";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AppData, Exercise } from "../domain/types";
import { guideFor } from "../content/catalog";
import {
  difficultyDefinitions,
  exerciseDifficultyInfo,
} from "../content/exercise-difficulty";
import { exercisePerformance } from "../domain/analytics";
import Modal from "../components/Modal";
import Icon from "../components/Icon";
import TrendChart from "../components/TrendChart";
import { displayWeight } from "../domain/units";
import ExerciseArtPlayer, {
  type ArtPlaybackPreferences,
} from "../components/ExerciseArtPlayer";
import { artworkSource } from "../content/media-source";
import { textSource } from "../content/external-guidance";
import { textLicense } from "../content/text-license";
import { BodyFigure } from "../components/BodyAtlas";
import { exerciseMuscles } from "../content/body-map";
import ReferenceMedia from "../components/ReferenceMedia";
import OpenGymMedia from "../components/OpenGymMedia";
import SetHistory from './workout/SetHistory';
import { exerciseSetHistory } from './workout/performance';
import {
  isOpenGymExercise,
  loadOpenGymCatalogue,
  openGymEntryFor,
} from "../content/opengym-catalogue";

export function recordingText(exercise: Exercise) {
  return exercise.kind === "weight-reps"
    ? "填写总外部负重与实际次数。双哑铃同时做时两只合计，单侧左右分别记组；不自动乘2。器械配重只在同一设备条件下比较。"
    : exercise.kind === "reps"
      ? "记录实际完成次数。自重、辅助器械配重不计入重量容量；左右分别练习时各记一组。"
      : "按秒记录实际持续时长，独立于重量容量。有氧动作当前按时长记录，不从时间推算距离或热量。";
}
type View = "brief" | "detailed" | "history";
export default function ExerciseDetails({
  exercise,
  data,
  onClose,
  onUse,
  onFavorite,
  favorite = false,
  actionBusy = false,
  actionError = "",
}: {
  exercise: Exercise;
  data?: AppData;
  onClose: () => void;
  onUse?: () => void;
  onFavorite?: () => void;
  favorite?: boolean;
  actionBusy?: boolean;
  actionError?: string;
}) {
  const guide = guideFor(exercise);
  const [catalogueState, setCatalogueState] = useState("loading");
  useEffect(() => {
    if (!isOpenGymExercise(exercise.id)) return;
    let alive = true;
    void loadOpenGymCatalogue()
      .then(() => {
        if (alive) setCatalogueState("ready");
      })
      .catch(() => {
        if (alive) setCatalogueState("error");
      });
    return () => {
      alive = false;
    };
  }, [exercise.id]);
  const extended = openGymEntryFor(exercise.id);
  const difficulty = exerciseDifficultyInfo(exercise);
  const [tab, setTab] = useState<View>("brief");
  const [artPreferences, setArtPreferences] = useState<ArtPlaybackPreferences>({
    frame: 1,
    speed: 1,
    loop: true,
  });
  const panel = useRef<HTMLDivElement>(null);
  const performance = data
    ? exercisePerformance(data.sessions, exercise.id, exercise.kind)
    : [];
  const setHistory = tab === 'history' && data ? exerciseSetHistory(data.sessions, exercise) : [];
  const muscles = exerciseMuscles(exercise);
  const format = (n: number) =>
    exercise.kind === "weight-reps"
      ? `${displayWeight(n, data?.settings.unit ?? "kg")} ${data?.settings.unit ?? "kg"}`
      : exercise.kind === "duration"
        ? `${n} 秒`
        : `${n} 次`;
  const changeView = (next: View) => {
    if (next === tab) return;
    setTab(next);
    document
      .getElementById(`exercise-tab-${next}`)
      ?.focus({ preventScroll: true });
  };
  const tabs: [View, string][] = [
    ["brief", "简洁讲解"],
    ["detailed", "详细讲解"],
    ["history", "我的表现"],
  ];
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    changeView(tabs[next][0]);
  }
  return (
    <Modal
      title={exercise.name}
      onClose={onClose}
      wide
      footer={
        <>
          {onFavorite && (
            <button
              className="btn btn-secondary"
              aria-pressed={favorite}
              onClick={onFavorite}
            >
              <Icon name="heart" />
              {favorite ? "已收藏" : "收藏动作"}
            </button>
          )}
          {onUse && (
            <button
              className="btn btn-primary"
              disabled={actionBusy}
              onClick={onUse}
            >
              <Icon name="plus" />
              {data?.sessions.some((s) =>
                ["active", "paused", "review"].includes(s.status),
              )
                ? "加入当前训练"
                : "从这个动作开练"}
            </button>
          )}
        </>
      }
    >
      {actionError && (
        <p role="alert" className="error-text">
          {actionError}
        </p>
      )}
      <div className="detail-meta">
        <span className="truncate" title={muscleLabel(exercise)}>
          {muscleLabel(exercise)}
        </span>
        <span className="truncate" title={exercise.equipment}>
          {exercise.equipment}
        </span>
        <span
          className="truncate"
          title="动作技术门槛参考，不代表训练重量或用力程度"
        >
          技术难度 · {difficultyDefinitions[difficulty.level].label}
        </span>
        {guide && (
          <span className="truncate">
            {guide.stretch ? "拉伸与活动度" : guide.title}
          </span>
        )}
      </div>
      {guide && <p className="exercise-english wrap-cjk">{guide.english}</p>}
      {extended && (
        <p className="exercise-english wrap-cjk">{extended.nameEn}</p>
      )}
      {tab !== "history" && (
        <details className="exercise-difficulty-note wrap-cjk">
          <summary>
            查看技术难度依据
            {difficulty.source === "general-reference" ? " · 待确认" : ""}
          </summary>
          <p>{difficulty.reason}</p>
          <p className="muted">
            {difficulty.source === "unrated"
              ? "待评估不表示简单或困难。"
              : difficulty.source === "catalogue-reference"
                ? "原目录参考分级，不是个人体能等级。"
                : "项目按动作类型整理的参考分级，不是原作者提供的官方等级。"}
          </p>
          <dl>
            {Object.entries(difficultyDefinitions).map(([key, item]) => (
              <div key={key}>
                <dt>{item.label}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <div
        className="explanation-tabs"
        role="tablist"
        aria-label="动作详情视图"
      >
        {tabs.map(([id, label], index) => (
          <button
            id={`exercise-tab-${id}`}
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls="exercise-panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => tabKey(event, index)}
            onClick={() => changeView(id)}
          >
            {label}
            {id === "history" && performance.length > 0 && (
              <small>{performance.length}</small>
            )}
          </button>
        ))}
      </div>
      <div
        ref={panel}
        id="exercise-panel"
        className={`explanation-panel ${tab}`}
        role="tabpanel"
        aria-labelledby={`exercise-tab-${tab}`}
        tabIndex={0}
      >
        {tab !== "history" ? (
          guide ? (
            <>
              <div className="technique-layout">
                <ExerciseArtPlayer
                  key={exercise.id}
                  exerciseId={exercise.id}
                  name={exercise.name}
                  view={tab}
                  initial={artPreferences}
                  onPreferencesChange={setArtPreferences}
                />
                <section className="technique-steps wrap-cjk">
                  <h3>{tab === "brief" ? "三个要点，开始练习" : "动作步骤"}</h3>
                  {tab === "detailed" && (
                    <p className="technique-variation">{guide.variation}</p>
                  )}
                  <ol>
                    {(tab === "brief" ? guide.quickSteps : guide.steps).map(
                      (step, i) => (
                        <li key={step}>
                          <b>{["准备", "动作", "控制"][i] ?? i + 1}</b>
                          <p>{step}</p>
                        </li>
                      ),
                    )}
                  </ol>
                  {tab === "brief" && (
                    <p className="brief-form-note">
                      <Icon name="target" size={16} />
                      {guide.cues[0]}
                    </p>
                  )}
                  {tab === "detailed" && guide.supplement && (
                    <details className="supplement-guidance">
                      <summary>补充练习提示</summary>
                      <ul>
                        {guide.supplement.hints.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              </div>
              {tab === "brief" ? (
                <div className="brief-reference wrap-cjk">
                  <section>
                    <h3>发力与呼吸</h3>
                    <p>{guide.breathing}</p>
                  </section>
                  <section>
                    <h3>常见错误</h3>
                    <p>{guide.mistakes[0]}</p>
                  </section>
                  <button
                    className="explanation-more"
                    onClick={() => changeView("detailed")}
                  >
                    查看详细讲解与记录方式
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <section
                    className="muscle-reference"
                    aria-label="动作参与肌群"
                  >
                    <h3>参与部位</h3>
                    <div className="muscle-reference-layout">
                      <div className="muscle-reference-diagram">
                        <BodyFigure
                          side="front"
                          primary={muscles.primary}
                          secondary={muscles.secondary}
                        />
                        <BodyFigure
                          side="back"
                          primary={muscles.primary}
                          secondary={muscles.secondary}
                        />
                      </div>
                      <div className="muscle-reference-copy wrap-cjk">
                        <p>
                          <strong>主要：</strong>
                          {guide.primary}
                        </p>
                        <p>
                          <strong>协同：</strong>
                          {guide.secondary.join("、") ||
                            "依动作姿势与个人控制而定"}
                        </p>
                        <small className="muted">
                          实色为主要部位，虚线为协同部位。区域为导航示意。
                        </small>
                      </div>
                    </div>
                  </section>
                  <div className="guide-grid wrap-cjk">
                    <section>
                      <h3>
                        <Icon name="target" size={16} />
                        发力与呼吸
                      </h3>
                      <p>{guide.breathing}</p>
                      <ul>
                        {guide.cues.map((cue) => (
                          <li key={cue}>{cue}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3>
                        <Icon name="alert" size={16} />
                        常见错误
                      </h3>
                      <ul>
                        {guide.mistakes.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3>如何记录</h3>
                      <p>{recordingText(exercise)}</p>
                    </section>
                  </div>
                  <ReferenceMedia key={exercise.id} exerciseId={exercise.id} />
                  <details className="content-credit wrap-cjk">
                    <summary>图解来源与内容说明</summary>
                    <p>
                      图解：{artworkSource.author}，部分基础姿势源自
                      Everkinetic，CC BY-SA
                      4.0。中文步骤为铁律独立整理；帕洛夫抗旋推使用铁律另绘示意，同许可提供。上游原始文件保持不变，展示时通过
                      CSS 反相适配浅底。图解仅为姿势示意。
                    </p>
                    <p>
                      <a
                        href={artworkSource.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        原始图解目录
                      </a>{" "}
                      ·{" "}
                      <a
                        href={artworkSource.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        图解许可
                      </a>{" "}
                      ·{" "}
                      <a
                        href={artworkSource.attributionUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        完整署名与修改记录
                      </a>
                      {guide.artSource && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={guide.artSource}
                            target="_blank"
                            rel="noreferrer"
                          >
                            基础姿势来源
                          </a>
                        </>
                      )}
                    </p>
                    {guide.supplement && (
                      <>
                        <p>
                          补充练习提示参考 Hasan Emir Yıldırım /
                          exercises-dataset（MIT），条目{" "}
                          {guide.supplement.sourceId}。{textSource.changes}
                        </p>
                        <p>
                          <a
                            href={`${textSource.repository}/blob/${textSource.revision}/${textSource.path}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            文字原始来源
                          </a>
                        </p>
                        <details>
                          <summary>第三方文字许可全文</summary>
                          <p className="text-license">{textLicense}</p>
                        </details>
                      </>
                    )}
                  </details>
                </>
              )}
            </>
          ) : extended ? (
            <div className="opengym-explanation wrap-cjk">
              <OpenGymMedia exerciseId={exercise.id} name={exercise.name} />
              <h2>
                {tab === "brief"
                  ? "动作要点"
                  : extended.instructionsZh.length
                    ? "完整中文步骤"
                    : "中文类型提示"}
              </h2>
              {!extended.instructionsZh.length && (
                <p className="muted">
                  以下中文按动作类型整理，帮助理解控制要求；不是原文逐句翻译，完整资料保留在详细讲解中。
                </p>
              )}
              <ol>
                {(extended.instructionsZh.length
                  ? extended.instructionsZh
                  : difficulty.cues
                )
                  .slice(0, tab === "brief" ? 3 : undefined)
                  .map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
              </ol>
              {tab === "brief" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => changeView("detailed")}
                >
                  查看完整步骤与记录说明
                  <Icon name="arrow" size={16} />
                </button>
              )}
              {tab === "detailed" && (
                <>
                  {!extended.instructionsZh.length && (
                    <section lang="en">
                      <h3 lang="zh-CN">完整步骤 · 英文原文</h3>
                      {extended.instructionsEn.length ? (
                        <ol>
                          {extended.instructionsEn.map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ol>
                      ) : (
                        <p lang="zh-CN">
                          源资料暂无分步文字，请结合示范与动作描述阅读。
                        </p>
                      )}
                    </section>
                  )}
                  <h3>
                    {extended.descriptionZh
                      ? "动作描述"
                      : "动作描述 · 英文原文"}
                  </h3>
                  <p lang={extended.descriptionZh ? "zh-CN" : "en"}>
                    {extended.descriptionZh ||
                      extended.descriptionEn ||
                      "源资料未提供额外描述。"}
                  </p>
                  <h3>记录方式</h3>
                  <p>{recordingText(exercise)}</p>
                  <p>
                    动作类别：{extended.category}
                    。器械与辅助重量的含义因设备而异，不跨设备比较容量。
                  </p>
                </>
              )}
              <p className="content-attribution">
                文字来源：openGym / {extended.provenance.textSource}。 原文授权{" "}
                {extended.provenance.originalTextLicense}；新增描述与中文译文
                AGPL-3.0-or-later。
                <a
                  href="/exercise-catalogue/opengym-NOTICE.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看完整署名与授权
                </a>
              </p>
            </div>
          ) : isOpenGymExercise(exercise.id) ? (
            <div className="custom-exercise-guide wrap-cjk">
              <p role="status">
                {catalogueState === "error"
                  ? "扩展讲解暂不可用，请联网后重开；已保存的记录与说明保留。"
                  : "正在载入动作讲解…"}
              </p>
              <p>{exercise.description}</p>
              <h3>记录方式</h3>
              <p>{recordingText(exercise)}</p>
            </div>
          ) : (
            <div className="custom-exercise-guide wrap-cjk">
              <Icon name="book" size={24} />
              <h3>你的个人动作</h3>
              <p>
                {exercise.description ||
                  "尚未填写个人说明，可在训练中添加自己的动作提示。"}
              </p>
              {tab === "detailed" && (
                <>
                  <h3>记录方式</h3>
                  <p>{recordingText(exercise)}</p>
                  <p>自定义动作使用你填写的说明，不自动套用其他动作的教学。</p>
                </>
              )}
            </div>
          )
        ) : (
          <>
            {setHistory.length > 0 && <SetHistory history={setHistory} kind={exercise.kind} unit={data?.settings.unit ?? 'kg'} />}
            {performance.length ? (
              <>
                <TrendChart
                  title={`${exercise.name}表现`}
                  points={performance.map((p) => ({
                    date: p.date,
                    label: `${p.date} · ${p.name}`,
                    value:
                      exercise.kind === "weight-reps"
                        ? p.maxWeightKg
                        : exercise.kind === "duration"
                          ? p.maxDuration
                          : p.maxReps,
                  }))}
                  format={format}
                />
                <div className="exercise-log">
                  {[...performance].reverse().map((p) => (
                    <div key={p.sessionId}>
                      <span>
                        <strong>{p.date}</strong>
                        <small className="truncate">
                          {p.name} · {p.sets} 个正式组
                        </small>
                      </span>
                      <b>
                        {format(
                          exercise.kind === "weight-reps"
                            ? p.maxWeightKg
                            : exercise.kind === "duration"
                              ? p.maxDuration
                              : p.maxReps,
                        )}
                      </b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="exercise-performance-empty">
                <Icon name="chart" size={24} />
                <h3>还没有这个动作的训练记录</h3>
                <p>完成并保存训练后，这里会显示正式组的表现趋势。</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => changeView("brief")}
                >
                  返回动作讲解
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
