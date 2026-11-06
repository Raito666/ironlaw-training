import type { ReactNode, RefObject } from 'react';
import type { AppData, Session } from '../domain/types';
import type { useWorkspace } from '../hooks/useWorkspace';
import Icon from '../components/Icon';
import BrandMark from '../components/BrandMark';
import NavIcon from '../components/NavIcon';
import IosInputAccessory from '../components/IosInputAccessory';
import { isIos } from '../platform/native';
import { navigation, pageTitles, type Page } from './navigation';
import { useLayoutEffect, useRef } from 'react';
import { animatePage, markPageParts } from '../motion/presentation';
import { useWebInputViewport } from '../platform/useWebInputViewport';
import { PwaUpdateNotice } from '../features/AppReadiness';

type Props = {
  page: Page;
  pageMotion: 'initial' | 'native' | 'fallback';
  active?: Session;
  data: AppData;
  online: boolean;
  workspace: ReturnType<typeof useWorkspace>;
  mainRef: RefObject<HTMLElement | null>;
  go: (page: Page) => void;
  exportCurrent: () => void;
  onReload: () => void;
  children: ReactNode;
  overlays: ReactNode;
};
export default function AppShell({
  page,
  pageMotion,
  active,
  data,
  online,
  workspace,
  mainRef,
  go,
  exportCurrent,
  onReload,
  children,
  overlays,
}: Props) {
  useWebInputViewport();
  const renderedPage = useRef(page);
  useLayoutEffect(() => {
    if (mainRef.current) markPageParts(mainRef.current);
    if (renderedPage.current === page) return;
    renderedPage.current = page;
    if (mainRef.current && pageMotion === 'fallback') return animatePage(mainRef.current);
  }, [page, pageMotion, mainRef]);
  const { status, error, writable, mutate } = workspace;
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const todayKey = dateKey(new Date());
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const key = dateKey(day);
    return {
      key,
      label: '一二三四五六日'[index],
      done: data.sessions.some((session) => session.status === 'completed' && session.date === key),
      today: key === todayKey,
    };
  });
  const weekCount = weekDays.filter((day) => day.done).length;
  const nav = (mobile: boolean) => (
    <nav className={mobile ? 'mobile-nav' : 'sidebar-nav'} aria-label={mobile ? '移动端导航' : '主导航'}>
      {navigation.map((n) => {
        const activePage = page === n.page || (page === 'workout' && n.page === 'today');
        return (
          <button
            key={n.page}
            className={`nav-item ${activePage ? 'active' : ''}`}
            aria-current={page === n.page ? 'page' : undefined}
            onClick={() => go(n.page)}
          >
            <NavIcon name={n.page as Exclude<Page, 'workout'>} active={activePage} />
            <span className="truncate">{n.name}</span>
            {n.page === 'today' && active && <span className="nav-dot" />}
          </button>
        );
      })}
    </nav>
  );
  return (
    <div className="app-shell" data-native-platform={isIos() ? 'ios' : undefined}>
      <a
        className="skip-link"
        href="#main-content"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        跳到主内容
      </a>
      <aside className="sidebar">
        <a className="brand" href="#/today" aria-label="铁律 IRONLAW 首页">
          <BrandMark size={44} className="brand-mark" />
          <span className="brand-wordmark">
            铁律<small>IRONLAW</small>
          </span>
        </a>
        {nav(false)}
        <div className="sidebar-week" aria-label={`本周已完成 ${weekCount} 个训练日`}>
          <div className="sidebar-week-head">
            <span>本周</span>
            <strong>{weekCount}<small> 天</small></strong>
          </div>
          <div className="sidebar-week-days" aria-hidden="true">
            {weekDays.map((day) => (
              <i key={day.key} className={`${day.done ? 'done' : ''}${day.today ? ' today' : ''}`} title={`${day.label} ${day.done ? '已训练' : '未训练'}`}>
                <span>{day.label}</span>
              </i>
            ))}
          </div>
        </div>
        <div className="sidebar-foot">
          <strong>每一组，都算数。</strong>
          <p>力量有迹可循。</p>
          <span>本地优先 · 无需账号</span>
        </div>
      </aside>
      <main className="main" id="main-content" data-page={page} data-page-motion={pageMotion} ref={mainRef} tabIndex={-1}>
        {page !== 'workout' && <PwaUpdateNotice />}
        {!online && (
          <div className="offline-banner">
            <Icon name="wifi" />
            当前离线，已加载的记录功能继续保存在本机。
          </div>
        )}
        {!writable && (
          <div className="notice readonly-banner">
            <span>当前为只读模式：另一个页面正在编辑。</span>
            <button className="btn btn-secondary" onClick={() => void workspace.takeover()}>
              在此页编辑
            </button>
          </div>
        )}
        {(status === 'error' || status === 'conflict') && (
          <div className="error-banner" role="alert">
            <strong>{status === 'conflict' ? '本地内容已被另一页面更新' : '本地保存未完成'}</strong>
            <p>{error}。当前输入保留在本页；关闭页面前请重试或导出。</p>
            <div className="row wrap">
              {status === 'error' && (
                <button className="btn btn-secondary" disabled={!writable} onClick={() => void workspace.retry()}>
                  重试保存
                </button>
              )}
              <button className="btn btn-secondary" onClick={exportCurrent}>
                导出当前记录
              </button>
              <button className="btn btn-ghost" onClick={() => onReload()}>
                载入已保存版本
              </button>
            </div>
          </div>
        )}
        {error && status === 'saved' && (
          <div role="alert" className="notice error-text">
            {error}
          </div>
        )}
        <div className="topbar">
          {page !== 'workout' && (
            <div className="page-head">
              <BrandMark size={28} className="mobile-brand-mark" />
              <div className="page-head-copy">
                <h1 className={page === 'progress' || page === 'exercises' ? 'compact-page-title wrap-cjk' : 'wrap-cjk'}>
                  {pageTitles[page][0]}
                </h1>
                {pageTitles[page][1] && <p className="page-subtitle">{pageTitles[page][1]}</p>}
              </div>
            </div>
          )}
          <div className="top-actions">
            <span className={`save-indicator ${status}`} role="status">
              <span className="save-dot" />
              <span className="truncate save-detail">{status === 'saving'
                ? '正在本地保存…'
                : status === 'saved'
                  ? '已保存到本机'
                  : status === 'loading'
                    ? '正在打开'
                    : '尚未保存'}</span>
              <span className="save-compact">{status === 'saving' ? '保存中' : status === 'saved' ? '已保存' : status === 'loading' ? '打开中' : '未保存'}</span>
              {workspace.savedAt && status === 'saved' && <small>{workspace.savedAt}</small>}
            </span>
            <button
              className="icon-button"
              aria-label="切换主题"
              data-haptic="selection"
              disabled={!writable}
              onClick={() =>
                void mutate((d) => ({
                  ...d,
                  settings: { ...d.settings, theme: d.settings.theme === 'dark' ? 'light' : 'dark' },
                }))
              }
            >
              <Icon name={data.settings.theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </div>
        {children}
      </main>
      {page !== 'workout' && nav(true)}
      {overlays}
      <IosInputAccessory />
    </div>
  );
}
