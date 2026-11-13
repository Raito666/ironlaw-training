import type { AppData, Session, TrainingDate, WorkoutTemplate } from '../../domain/types';
import { uid } from '../../domain/training';
import { isRetiredStarterTemplate } from '../../domain/seed';
import Icon from '../../components/Icon';
import { useLayoutEffect, useRef, useState } from 'react';
import { useListMotion } from '../../motion/presentation';
import Modal from '../../components/Modal';
import { exportTextFile } from '../../platform/native';
import {
  exportTemplate,
  parseTemplate,
  importTemplate,
  printableTemplate,
  type SharedTemplate,
} from '../portable-content';
import { usePendingMutation } from '../pending-mutation';
import PresetPlans from './PresetPlans';
import { resolvePresetDay } from '../../content/training-presets';
import { TrainingDateForm, TrainingSchedulePanel } from './TrainingSchedule';
import type { TrainingScheduleController } from './useTrainingSchedule';
type Props = {
  data: AppData;
  templates: WorkoutTemplate[];
  showArchived: boolean;
  writable: boolean;
  mutate: (fn: (data: AppData) => AppData) => Promise<boolean>;
  retry: () => Promise<boolean>;
  openStart: (template: WorkoutTemplate | 'free', scheduleId?: string) => void;
  preview: (template: WorkoutTemplate) => void;
  setTemplateEditor: (template: WorkoutTemplate | 'new') => void;
  setArchiveTemplate: (template: WorkoutTemplate) => void;
  setShowArchived: (show: boolean) => void;
  schedule: TrainingScheduleController;
  findScheduledSession: (entry: TrainingDate) => Session | undefined;
  onScheduledHistory: (session: Session) => void;
};
export default function PlansPage({
  data,
  templates,
  showArchived,
  writable,
  mutate,
  retry,
  openStart,
  preview,
  setTemplateEditor,
  setArchiveTemplate,
  setShowArchived,
  schedule,
  findScheduledSession,
  onScheduledHistory,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<SharedTemplate | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingImport = usePendingMutation(mutate, retry);
  useLayoutEffect(() => {
    if (new URLSearchParams(location.hash.split('?')[1]).has('schedule')) {
      document.getElementById('training-schedule')?.scrollIntoView({ block: 'start' });
    }
  }, []);
  const closeImport = () => {
    if (!busy)
      void pendingImport.cancel().then((ok) => {
        if (ok) setIncoming(null);
      });
  };
  async function share(template: WorkoutTemplate, print = false) {
    setFileError('');
    try {
      await exportTextFile({
        name: `铁律-${template.name.replace(/[\\/:*?"<>|]/g, '_')}.${print ? 'html' : 'json'}`,
        text: print ? printableTemplate(template, data.exercises) : exportTemplate(template, data.exercises),
        type: print ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8',
      });
    } catch {
      setFileError('文件暂未导出，请重试。训练模板和记录保留。');
    }
  }
  useListMotion(
    ref,
    JSON.stringify([showArchived, templates.map((template) => template.id)]),
    ':scope > .template-card',
  );
  const templateCards = (
    <div className="template-grid" ref={ref}>
      {(showArchived ? data.templates.filter((t) => !isRetiredStarterTemplate(t)) : templates).map((t) => (
        <section className="card template-card" key={t.id}>
          <div>
            <h2 className="truncate" title={t.name}>
              {t.name}
            </h2>
            <p className="muted wrap-cjk">{t.description}</p>
            <div className="template-meta">
              <span>{t.items.length} 个动作</span>
              <span>{t.items.reduce((n, item) => n + item.sets, 0)} 组</span>
              <span>休息 {t.restSeconds} 秒</span>
            </div>
          </div>
          {t.archived ? (
            <button
              className="btn btn-secondary"
              disabled={!writable}
              onClick={() =>
                void mutate((d) => ({
                  ...d,
                  templates: d.templates.map((x) =>
                    x.id === t.id ? { ...x, archived: false, updatedAt: new Date().toISOString() } : x,
                  ),
                }))
              }
            >
              恢复模板
            </button>
          ) : (
            <>
              <button className="btn btn-primary" disabled={!writable} onClick={() => openStart(t)}>
                <span className="truncate">开练 · {t.name}</span>
                <Icon name="arrow" size={16} />
              </button>
              <div className="row template-actions">
                <button className="btn btn-ghost" onClick={() => preview(t)}>预览</button>
                <button className="btn btn-ghost" onClick={() => void share(t)}>
                  分享模板
                </button>
                <button className="btn btn-ghost" onClick={() => void share(t, true)}>
                  导出打印版
                </button>
                <button className="btn btn-ghost" disabled={!writable} onClick={() => setTemplateEditor(t)}>
                  <Icon name="edit" size={16} />
                  编辑
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!writable}
                  onClick={() =>
                    void mutate((d) => ({
                      ...d,
                      templates: [
                        ...d.templates,
                        {
                          ...structuredClone(t),
                          id: uid(),
                          name: `${t.name.slice(0, 110)}（副本）`,
                          updatedAt: new Date().toISOString(),
                        },
                      ],
                    }))
                  }
                >
                  <Icon name="copy" size={16} />
                  复制
                </button>
                <button
                  className="icon-button danger-text"
                  disabled={!writable}
                  aria-label={`归档模板${t.name}`}
                  onClick={() => setArchiveTemplate(t)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <TrainingDateForm template={t} schedule={schedule} />
            </>
          )}
        </section>
      ))}
    </div>
  );
  return (
    <>
      {schedule.entries.length > 0 && (
        <button className="btn btn-secondary training-schedule-jump" type="button" onClick={() => document.getElementById('training-schedule')?.scrollIntoView({ block: 'start' })}>
          <Icon name="calendar" /> 查看已安排的训练（{schedule.entries.length}）
        </button>
      )}
      <PresetPlans data={data} writable={writable} mutate={mutate} retry={retry} openStart={openStart} schedule={schedule} />
      <TrainingSchedulePanel schedule={schedule} findSession={findScheduledSession} writable={writable} openStart={openStart} onView={onScheduledHistory}
        resolveTemplate={(entry) => resolvePresetDay(entry.templateId, data.templates.find((template) => template.id === entry.templateId), entry.choices)} />
      <div className="section-heading">
        <div>
          <h2>训练日模板</h2>
          <p className="muted">安排是目标，记录是实际。模板修改不会改变过去的训练。</p>
        </div>
        <button className="btn btn-primary" disabled={!writable} onClick={() => setTemplateEditor('new')}>
          <Icon name="plus" />
          新建模板
        </button>
      </div>
      {templateCards}
      <div className="row wrap section-spacer">
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="导入训练模板文件"
          onChange={async (event) => {
            const selected = event.target.files?.[0];
            event.target.value = '';
            if (!selected) return;
            setFileError('');
            try {
              if (selected.size > 1024 * 1024) throw new Error('模板文件不能超过1 MB');
              setIncoming(parseTemplate(await selected.text(), data));
            } catch (error) {
              setFileError(error instanceof Error ? error.message : '无法读取模板文件');
            }
          }}
        />
        <button className="btn btn-secondary" disabled={!writable} onClick={() => file.current?.click()}>
          导入分享模板
        </button>
        <button className="btn btn-secondary" disabled={!writable} onClick={() => openStart('free')}>
          直接开始自由训练
        </button>
        <button className="btn btn-ghost" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? '隐藏已归档模板' : '查看已归档模板'}
        </button>
      </div>
      {fileError && (
        <p role="alert" className="error-text">
          {fileError}
        </p>
      )}
      {incoming && (
        <Modal
          title="导入训练模板"
          onClose={closeImport}
          footer={
            <>
              <button className="btn btn-secondary" disabled={busy} onClick={closeImport}>
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !writable}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (await pendingImport.run((latest) => importTemplate(latest, incoming))) {
                      setIncoming(null);
                      setFileError('');
                    } else setFileError('模板尚未保存。可以重试，或取消这次导入；不会重复追加。');
                  } catch (error) {
                    setFileError(error instanceof Error ? error.message : '模板未导入，请重试');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? '正在导入…' : '作为新模板导入'}
              </button>
            </>
          }
        >
          <h3 className="wrap-cjk">{incoming.template.name}</h3>
          <p>
            {incoming.template.items.length} 个动作 ·{' '}
            {incoming.template.items.reduce((sum, item) => sum + item.sets, 0)} 组
          </p>
          <p className="notice">
            作为独立模板加入，现有模板、训练历史和身体数据保留。分享文件只包含模板和相关动作，不含个人历史。
          </p>
          {fileError && (
            <p role="alert" className="error-text">
              {fileError}
            </p>
          )}
        </Modal>
      )}
      {!templates.length && !showArchived && (
        <div className="card empty-state">
          <h2>安排下一场训练。</h2>
          <p>创建模板，或直接开始自由训练。</p>
        </div>
      )}
    </>
  );
}
