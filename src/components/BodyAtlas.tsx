import { isCompactViewport } from '../platform/compact-layout';
import { useState, type KeyboardEvent } from 'react';
import type { Exercise } from '../domain/types';
import {
  jointGroups,
  muscleGroups,
  matchesBodyTarget,
  targetLabel,
  type BodySide,
  type BodyTarget,
  type MuscleId,
  type JointId,
} from '../content/body-map';

import bodyPaths from '../content/body-paths.json';

// The body artwork is adapted from the MIT-licensed MuscleMap SVG path set.
// It is rendered as a detailed editorial anatomy plate, not a clinical diagram.
type BodySlug = keyof (typeof bodyPaths)['front'] | keyof (typeof bodyPaths)['back'];
type SidePaths = Record<string, { common: string[]; left: string[]; right: string[] }>;

const bodyViewBox: Record<BodySide, { x: number; y: number; width: number; height: number }> = {
  front: { x: 0, y: 95, width: 727, height: 1280 },
  back: { x: 718, y: 95, width: 727, height: 1280 },
};
const muscleSlugs: Record<BodySide, Partial<Record<MuscleId, BodySlug[]>>> = {
  front: {
    chest: ['chest', 'upperChest', 'lowerChest'],
    delts: ['deltoids', 'frontDeltoid'],
    biceps: ['biceps'],
    forearms: ['forearm'],
    abs: ['abs', 'upperAbs', 'lowerAbs'],
    obliques: ['obliques', 'serratus'],
    quads: ['quadriceps', 'innerQuad', 'outerQuad', 'hipFlexors'],
    adductors: ['adductors'],
    calves: ['calves'],
  },
  back: {
    upperback: ['trapezius', 'upperTrapezius', 'lowerTrapezius', 'rhomboids', 'rotatorCuff'],
    reardelts: ['rearDeltoid', 'deltoids'],
    triceps: ['triceps'],
    forearms: ['forearm'],
    lats: ['upperBack'],
    lowerback: ['lowerBack'],
    glutes: ['gluteal'],
    hamstrings: ['hamstring'],
    calves: ['calves'],
  },
};
const cosmeticSlugs: Record<BodySide, BodySlug[]> = {
  front: ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'tibialis', 'ankles'],
  back: ['head', 'hair', 'neck', 'hands', 'feet', 'ankles'],
};
const jointPositions: Record<JointId, [number, number]> = {
  shoulders: [238, 358],
  elbows: [188, 512],
  wrists: [150, 665],
  hips: [302, 686],
  knees: [285, 948],
  ankles: [258, 1192],
};

export function BodyFigure({
  side,
  mode = 'muscles',
  selected,
  primary = [],
  secondary = [],
  onSelect,
}: {
  side: BodySide;
  mode?: 'muscles' | 'joints';
  selected?: BodyTarget | null;
  primary?: MuscleId[];
  secondary?: MuscleId[];
  onSelect?: (target: BodyTarget) => void;
}) {
  function keySelect(event: KeyboardEvent<SVGGElement>, id: BodyTarget) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(id);
    }
  }
  const active = (id: MuscleId) =>
    selected === id || primary.includes(id) ? 'primary' : secondary.includes(id) ? 'secondary' : '';
  const view = bodyViewBox[side];
  const sidePaths = bodyPaths[side] as SidePaths;
  const mappedSlugs = new Set(Object.values(muscleSlugs[side]).flat());
  const baseSlugs = [
    ...cosmeticSlugs[side],
    ...Object.keys(sidePaths).filter((slug) => !mappedSlugs.has(slug as BodySlug)),
  ];
  const pathsFor = (slug: string) => {
    const part = sidePaths[slug];
    return part ? [...part.common, ...part.left, ...part.right] : [];
  };
  return (
    <svg
      className="body-figure"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      role="group"
      aria-label={`${side === 'front' ? '正面' : '背面'}身体${mode === 'joints' ? '关节' : '肌群'}图`}
    >
      <g className="body-base" aria-hidden="true">
        {baseSlugs.map((slug) =>
          pathsFor(slug).map((d, index) => (
            <path className={`body-part body-part-${slug}`} d={d} key={`${slug}-${index}`} />
          )),
        )}
        <ellipse className="body-ground" cx={view.x + view.width / 2} cy="1372" rx="150" ry="9" />
      </g>
      {mode === 'muscles'
        ? Object.entries(muscleSlugs[side]).map(([key, slugs]) => {
            const id = key as MuscleId;
            const paths = (slugs ?? []).flatMap(pathsFor);
            if (!paths.length) return null;
            return (
              <g
                key={id}
                className={`body-region ${active(id)}`}
                data-region={id}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`${onSelect ? '选择' : ''}${targetLabel(id)}`}
                aria-pressed={onSelect ? selected === id : undefined}
                onClick={() => onSelect?.(id)}
                onKeyDown={(event) => keySelect(event, id)}
              >
                <title>{targetLabel(id)}</title>
                {paths.map((d, index) => (
                  <path d={d} key={`${id}-${index}`} />
                ))}
              </g>
            );
          })
        : jointGroups.map((joint) => {
            const [x, y] = jointPositions[joint.id];
            const mirroredX = view.x + view.width - x;
            return (
              <g
                key={joint.id}
                className={`body-joint ${selected === joint.id ? 'primary' : ''}`}
                data-region={joint.id}
                role="button"
                tabIndex={0}
                aria-label={`选择${joint.label}`}
                aria-pressed={selected === joint.id}
                onClick={() => onSelect?.(joint.id)}
                onKeyDown={(event) => keySelect(event, joint.id)}
              >
                <title>{joint.label}</title>
                {[view.x + x, mirroredX].map((cx) => (
                  <g key={cx}>
                    <circle className="joint-hit" cx={cx} cy={y} r="24" />
                    <circle cx={cx} cy={y} r="12" />
                    <path d={`M${cx - 5} ${y}h10 M${cx} ${y - 5}v10`} />
                  </g>
                ))}
              </g>
            );
          })}
    </svg>
  );
}

export default function BodyAtlas({
  exercises,
  selected,
  includeSecondary,
  onSelect,
  onSecondary,
  onResults,
}: {
  exercises: Exercise[];
  selected: BodyTarget | null;
  includeSecondary: boolean;
  onSelect: (id: BodyTarget | null) => void;
  onSecondary: (value: boolean) => void;
  onResults: () => void;
}) {
  const [side, setSide] = useState<BodySide>('front');
  const [mode, setMode] = useState<'muscles' | 'joints'>('muscles');
  const [namesOpen, setNamesOpen] = useState(() => !isCompactViewport());
  const groups = mode === 'muscles' ? muscleGroups : jointGroups;
  const current = groups.find((group) => group.id === selected);
  const count = selected
    ? exercises.filter((ex) => matchesBodyTarget(ex, selected, includeSecondary)).length
    : exercises.length;
  const sections =
    mode === 'muscles'
      ? [
          {
            label: '上肢',
            groups: muscleGroups.filter((group) =>
              ['delts', 'biceps', 'triceps', 'forearms', 'reardelts'].includes(group.id),
            ),
          },
          {
            label: '躯干',
            groups: muscleGroups.filter((group) =>
              ['chest', 'abs', 'obliques', 'upperback', 'lats', 'lowerback'].includes(group.id),
            ),
          },
          {
            label: '下肢',
            groups: muscleGroups.filter((group) =>
              ['quads', 'adductors', 'hamstrings', 'glutes', 'calves'].includes(group.id),
            ),
          },
        ]
      : [{ label: '活动关节', groups: jointGroups }];
  const currentDetail = current && 'detail' in current ? current.detail : '';
  function choose(id: BodyTarget | null) {
    onSelect(id);
    const group = muscleGroups.find((g) => g.id === id);
    if (group?.side === 'back' || group?.side === 'front') setSide(group.side);
  }
  function switchMode(next: 'muscles' | 'joints') {
    setMode(next);
    onSelect(null);
  }
  return (
    <section className="body-atlas" aria-label="按身体找动作">
      <div className="atlas-heading">
        <div className="atlas-heading-copy">
          <span className="atlas-kicker">
            <i /> BODY MAP
          </span>
          <h3>今天想练哪里？</h3>
          <p>点选身体，或按名称直接选部位。</p>
        </div>
        <div className="segmented" role="group" aria-label="身体图模式">
          <button
            aria-pressed={mode === 'muscles'}
            className={mode === 'muscles' ? 'active' : ''}
            onClick={() => switchMode('muscles')}
          >
            肌群
          </button>
          <button
            aria-pressed={mode === 'joints'}
            className={mode === 'joints' ? 'active' : ''}
            onClick={() => switchMode('joints')}
          >
            关节
          </button>
        </div>
      </div>
      <div className="atlas-layout">
        <div className="atlas-visual">
          <div className="atlas-stage-meta">
            <span>ANATOMY / 01</span>
            <span>
              {side === 'front' ? 'FRONT' : 'BACK'} · {mode === 'muscles' ? 'MUSCLE' : 'JOINT'}
            </span>
          </div>
          <div className="atlas-view-controls">
            <div className="segmented atlas-side-control" role="group" aria-label="身体图朝向">
              <button
                aria-pressed={side === 'front'}
                className={side === 'front' ? 'active' : ''}
                onClick={() => setSide('front')}
              >
                正面
              </button>
              <button
                aria-pressed={side === 'back'}
                className={side === 'back' ? 'active' : ''}
                onClick={() => setSide('back')}
              >
                背面
              </button>
            </div>
          </div>
          <div className="atlas-stage" data-side={side}>
            <i className="atlas-stage-tick tick-tl" />
            <i className="atlas-stage-tick tick-tr" />
            <i className="atlas-stage-tick tick-bl" />
            <i className="atlas-stage-tick tick-br" />
            <div className={`atlas-figures atlas-turn-${side}`} key={side}>
              {(['front', 'back'] as const).map((view) => (
                <figure className={view === side ? 'shown' : ''} hidden={view !== side} key={view}>
                  <BodyFigure side={view} mode={mode} selected={selected} onSelect={choose} />
                  <figcaption>{view === 'front' ? '正面视图' : '背面视图'}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div className="atlas-stage-footer">
            <span>点击区域选择</span>
            <span>{selected ? targetLabel(selected) : `全身 · ${exercises.length} 个动作`}</span>
          </div>
          <p className="atlas-diagram-note">部位导航示意 · 正面与背面共用同一动作库</p>
        </div>
        <div className="atlas-selection">
          <div className="atlas-selection-top">
            <span>BODY SELECTOR</span>
            <span>{current ? '已选择' : '全部动作'}</span>
          </div>
          <div className="atlas-selection-copy" aria-live="polite">
            <span className="atlas-selection-label">
              {current ? (mode === 'muscles' ? '已选肌群' : '已选关节') : '选择一个部位'}
            </span>
            <h4 key={current?.id ?? 'all'}>{current?.label ?? '从身体出发'}</h4>
            <p>
              {current?.hint ??
                (mode === 'muscles'
                  ? '可以点选身体图，也可以直接选择下面的部位名称。'
                  : '按明显活动关节整理动作，不包含仅负责稳定的关节。')}
            </p>
            {currentDetail && <small className="atlas-selection-detail">{currentDetail}</small>}
          </div>
          <div className="atlas-count-line" key={selected ?? 'all'}>
            <strong>{count}</strong>
            <span>个动作</span>
            <em>{current ? (mode === 'muscles' ? '主动肌' : '关节相关') : '全部动作库'}</em>
          </div>
          <details
            className="atlas-region-picker"
            open={namesOpen}
            onToggle={(event) => setNamesOpen(event.currentTarget.open)}
          >
            <summary>
              <span>按名称选择部位</span>
              <span className="atlas-picker-value">{current?.label ?? '全身'}</span>
            </summary>
            <div className="atlas-region-list" role="group" aria-label="身体部位名称">
              <button
                className={`atlas-all-choice${!selected ? ' active' : ''}`}
                aria-pressed={!selected}
                onClick={() => choose(null)}
              >
                <span>全身</span>
                <span>{exercises.length}</span>
              </button>
              {sections.map((section) => (
                <div className="atlas-region-section" key={section.label}>
                  <p>{section.label}</p>
                  <div className="atlas-region-grid">
                    {section.groups.map((group) => (
                      <button
                        key={group.id}
                        className={selected === group.id ? 'active' : ''}
                        aria-pressed={selected === group.id}
                        onClick={() => choose(group.id)}
                      >
                        <span>{group.label}</span>
                        <span>
                          {exercises.filter((ex) => matchesBodyTarget(ex, group.id, includeSecondary)).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
          {mode === 'muscles' && (
            <label className="atlas-secondary">
              <input
                type="checkbox"
                checked={includeSecondary}
                onChange={(event) => onSecondary(event.target.checked)}
              />
              包含协同参与的动作
            </label>
          )}
          <div className="atlas-result-action">
            <button className="btn btn-primary" onClick={onResults}>
              查看{count}个部位相关动作
            </button>
            {selected && (
              <button className="text-button" onClick={() => choose(null)}>
                取消部位选择
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
