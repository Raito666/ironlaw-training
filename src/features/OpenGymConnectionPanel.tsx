import { useState } from "react";
import ChoiceSelect from "../components/ChoiceSelect";
import type { Decisions } from "../sync/engine";
import type { OpenGymSyncController } from "../opengym/useOpenGymSync";
import type { SyncProvider } from "../opengym/types";
import "../styles/opengym.css";

export interface OpenGymConnectionPanelProps {
  controller: OpenGymSyncController;
  provider: SyncProvider;
  onProviderChange(mode: SyncProvider): Promise<boolean>;
}
const labels: Record<string, string> = {
  name: "名称",
  date: "日期",
  weightKg: "重量 kg",
  bodyFatPct: "体脂率 %",
  measurements: "围度 cm",
  note: "备注",
  description: "说明",
  muscle: "肌群",
  equipment: "器械",
  kind: "记录方式",
  sets: "组记录",
  reps: "次数",
  durationSeconds: "秒数",
  rpe: "RPE",
  type: "组类型",
  status: "状态",
  exercises: "动作",
  exercise: "动作快照",
  items: "模板动作",
  startedAt: "开始",
  finishedAt: "结束",
  updatedAt: "更新",
  restSeconds: "休息秒数",
  archived: "已归档",
  chest: "胸围",
  waist: "腰围",
  hip: "臀围",
  arm: "臂围",
  thigh: "腿围",
};
const words: Record<string, string> = {
  completed: "已完成",
  cancelled: "已取消",
  pending: "未完成",
  skipped: "跳过",
  warmup: "热身",
  work: "正式",
  drop: "递减",
  failure: "力竭",
  reps: "次数",
  duration: "时长",
  "weight-reps": "重量和次数",
};
function readable(value: unknown): string {
  if (value === null) return "已删除";
  if (Array.isArray(value))
    return value.map((v, i) => `${i + 1}. ${readable(v)}`).join("\n");
  if (value && typeof value === "object")
    return Object.entries(value)
      .filter(([key]) => labels[key])
      .map(([key, v]) => `${labels[key]}：${readable(v)}`)
      .join("\n");
  return typeof value === "boolean"
    ? value
      ? "是"
      : "否"
    : typeof value === "string"
      ? (words[value] ?? value)
      : String(value ?? "未填写");
}
export default function OpenGymConnectionPanel({
  controller: c,
  provider,
  onProviderChange,
}: OpenGymConnectionPanelProps) {
  const [server, setServer] = useState(
    c.server || (typeof location === "undefined" ? "" : location.origin),
  );
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [invite, setInvite] = useState(""),
    [pair, setPair] = useState("");
  const [register, setRegister] = useState(false),
    [current, setCurrent] = useState(""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState("");
  const [decisions, setDecisions] = useState<Decisions>({});
  const locked = c.busy || !c.ready || provider !== "opengym";
  let sameOrigin = false;
  try {
    sameOrigin = new URL(server).origin === location.origin;
  } catch {
    /* Invalid address is explained by the explicit check action. */
  }
  const webauthn = typeof PublicKeyCredential !== "undefined";
  const auth = async (passkey: boolean) => {
    const success = await c.signIn(
      server,
      passkey
        ? register
          ? "passkey-register"
          : "passkey-login"
        : register
          ? "password-register"
          : "password-login",
      { name, password, code: invite },
    );
    setPassword("");
    if (success) {
      setInvite("");
      setMessage("已连接。归档记录将合并同步，冲突保留双方供你选择。");
    }
  };
  return (
    <section
      className="card opengym-connection"
      aria-labelledby="opengym-heading"
    >
      <div className="opengym-heading">
        <h2 id="opengym-heading">同步方式</h2>
        <span className="tag">可选</span>
      </div>
      <p className="muted">
        本地记录可以独立使用。每次只启用一种同步，草稿、界面偏好与媒体始终留在本机。
      </p>
      {!c.supported ? (
        <p className="notice">
          自托管账号目前仅支持 Web。原生应用继续使用原有加密云同步。
        </p>
      ) : (
        <>
          <div className="field">
            当前同步方式
            <ChoiceSelect
              label="当前同步方式"
              icon="settings"
              value={provider}
              onChange={async (next) => {
                const success = await onProviderChange(next as SyncProvider);
                setCode("");
                setCurrent("");
                setMessage(
                  success
                    ? "同步方式已保存，本机记录保留。"
                    : "同步方式未切换，请检查设备支持或重试。",
                );
              }}
              options={[
                { value: "none", label: "仅本地记录" },
                { value: "netlify", label: "加密云同步" },
                { value: "opengym", label: "自托管 openGym" },
              ]}
            />
          </div>
          {provider === "opengym" && (
            <div className="opengym-body">
              <p className="notice">
                连接你自己运行的服务器。服务器保存可读的训练记录，请使用你信任的地址；这与加密云同步分别运行。
              </p>
              {c.connected ? (
                <>
                  <p className="opengym-status" role="status">
                    {c.busy
                      ? "正在连接并同步…"
                      : c.conflicts.length
                        ? `有 ${c.conflicts.length} 条记录需要选择版本`
                        : c.lastSuccess
                          ? `最近同步：${new Date(c.lastSuccess).toLocaleString("zh-CN")}`
                          : "已连接，等待首次同步"}
                  </p>
                  <p className="opengym-account">
                    <strong>{c.user?.name}</strong>
                    <span className="muted">{c.server}</span>
                  </p>
                  <div className="data-actions">
                    <button
                      className="btn btn-primary"
                      disabled={locked}
                      onClick={() => void c.sync()}
                    >
                      立即同步自托管记录
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={c.busy}
                      onClick={() => {
                        void c.disconnect();
                        setCode("");
                        setCurrent("");
                      }}
                    >
                      断开本机连接
                    </button>
                  </div>
                  <details className="opengym-pair">
                    <summary>连接另一台设备</summary>
                    <p className="muted">
                      生成一次性代码后，在另一设备选择自托管，输入同一服务器地址与代码。代码五分钟内有效，请私下传递。
                    </p>
                    <label className="field">
                      当前账号密码
                      <input
                        className="form-input"
                        type="password"
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                      />
                    </label>
                    <div className="data-actions">
                      <button
                        className="btn btn-secondary"
                        disabled={locked || !current}
                        onClick={async () => {
                          setCode((await c.createPairCode({ current })) ?? "");
                          setCurrent("");
                        }}
                      >
                        用密码生成配对代码
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={
                          locked ||
                          !webauthn ||
                          new URL(c.server).origin !== location.origin
                        }
                        onClick={async () =>
                          setCode((await c.createPairCode("passkey")) ?? "")
                        }
                      >
                        用通行密钥生成代码
                      </button>
                    </div>
                    {code && (
                      <output
                        className="opengym-code"
                        aria-label="一次性配对代码"
                      >
                        {code}
                      </output>
                    )}
                  </details>
                  <details className="opengym-pair">
                    <summary>账号登录管理</summary>
                    <p className="muted">
                      使此账号所有设备退出登录，包括当前设备。本机训练记录保留，其他设备需要重新登录或配对。
                    </p>
                    <button
                      className="btn btn-secondary"
                      disabled={locked}
                      onClick={() => void c.logoutEverywhere()}
                    >
                      退出全部设备
                    </button>
                  </details>
                </>
              ) : (
                <>
                  <label className="field">
                    服务器地址
                    <input
                      className="form-input"
                      type="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="url"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      placeholder="https://你的服务器"
                    />
                  </label>
                  <button
                    className="btn btn-secondary"
                    disabled={locked || !server}
                    onClick={() => void c.inspectServer(server)}
                  >
                    检查服务器
                  </button>
                  {c.config && (
                    <p className="notice">
                      服务器可用。
                      {c.config.password_login
                        ? "支持密码与通行密钥。"
                        : "使用通行密钥登录。"}
                      {c.config.invite_only ? "注册需要邀请代码。" : ""}
                    </p>
                  )}
                  {sameOrigin ? (
                    <form
                      className="opengym-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void auth(false);
                      }}
                    >
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={register}
                          onChange={(e) => setRegister(e.target.checked)}
                        />
                        创建新账号
                      </label>
                      <label className="field">
                        {register ? "账号名称" : "名称或邮箱"}
                        <input
                          className="form-input"
                          autoComplete="username"
                          maxLength={40}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      {register && (
                        <label className="field">
                          邀请代码（如需）
                          <input
                            className="form-input"
                            value={invite}
                            onChange={(e) => setInvite(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                      )}
                      {c.config?.password_login && (
                        <label className="field">
                          密码
                          <input
                            className="form-input"
                            type="password"
                            autoComplete={
                              register ? "new-password" : "current-password"
                            }
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </label>
                      )}
                      <div className="data-actions">
                        {c.config?.password_login && (
                          <button
                            className="btn btn-primary"
                            disabled={locked || !name || !password}
                            type="submit"
                          >
                            {register ? "用密码注册并连接" : "用密码登录并连接"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={locked || !webauthn || (register && !name)}
                          onClick={() => void auth(true)}
                        >
                          {register ? "创建通行密钥账号" : "使用通行密钥登录"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="notice">
                      其他地址的账号请在服务器自己的网页登录并生成配对代码，再回到这里连接。
                    </p>
                  )}
                  <details className="opengym-pair">
                    <summary>已有配对代码</summary>
                    <label className="field">
                      一次性配对代码
                      <input
                        className="form-input"
                        value={pair}
                        onChange={(e) => setPair(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={32}
                      />
                    </label>
                    <button
                      className="btn btn-primary"
                      disabled={locked || !server || !pair}
                      onClick={async () => {
                        if (await c.pair(server, pair)) setPair("");
                      }}
                    >
                      配对并合并记录
                    </button>
                  </details>
                </>
              )}
              {c.conflicts.length > 0 && (
                <div className="opengym-conflicts">
                  <p>两处修改均保留。查看版本后，选择每条记录保留哪一份。</p>
                  {c.conflicts.map((conflict) => (
                    <div key={conflict.key} className="opengym-conflict">
                      <strong>{conflict.name}</strong>
                      <div className="opengym-versions">
                        {(["local", "remote"] as const).map((side) => (
                          <details key={side}>
                            <summary>
                              {side === "local" ? "本机版本" : "服务器版本"}
                            </summary>
                            <pre>{readable(conflict[side])}</pre>
                          </details>
                        ))}
                      </div>
                      <div className="field">
                        保留版本
                        <ChoiceSelect
                          label={`${conflict.name} 保留版本`}
                          icon="settings"
                          value={decisions[conflict.key]?.choice ?? ""}
                          onChange={(choice) => {
                            setDecisions((prev) => {
                              const next = { ...prev };
                              if (choice)
                                next[conflict.key] = {
                                  choice: choice as "local" | "remote",
                                  local: conflict.local,
                                  remote: conflict.remote,
                                };
                              else delete next[conflict.key];
                              return next;
                            });
                          }}
                          options={[
                            { value: "", label: "请选择" },
                            { value: "local", label: "本机版本" },
                            { value: "remote", label: "服务器版本" },
                          ]}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="btn btn-primary"
                    disabled={
                      locked ||
                      c.conflicts.some((conflict) => !decisions[conflict.key])
                    }
                    onClick={() => void c.sync(decisions)}
                  >
                    合并并同步
                  </button>
                </div>
              )}
              {c.error && (
                <p className="error-text" role="alert">
                  {c.error}
                </p>
              )}
            </div>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
