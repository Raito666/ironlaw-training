---
name: 铁律 IRONLAW
description: 面向力量训练者的本地优先训练档案
colors:
  dark-bg: "#080A08"
  dark-panel: "#101310"
  dark-surface-2: "#151915"
  dark-surface-3: "#1B201B"
  dark-surface-4: "#232923"
  dark-text: "#F2EFE6"
  dark-muted: "#B9B8AC"
  dark-tertiary: "#86877D"
  dark-control: "#7C8476"
  dark-accent: "#A3E635"
  light-bg: "#F4F2EB"
  light-panel: "#FFFEFA"
  light-surface-2: "#F6F4EC"
  light-surface-3: "#EEECE3"
  light-surface-4: "#E5E3D9"
  light-text: "#171812"
  light-muted: "#56574E"
  light-tertiary: "#68695E"
  light-control: "#76776B"
  light-accent: "#4D7C0F"
typography:
  xs:
    fontSize: "11px"
  sm:
    fontSize: "13px"
  body:
    fontFamily: '"Ironlaw Local Noto VF", "MiSans", "HarmonyOS Sans SC", "PingFang SC", "Noto Sans SC", "Microsoft YaHei UI", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  title:
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.15
  section:
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  display:
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.05
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  circle: "9999px"
spacing:
  icon: "4px"
  compact: "8px"
  field: "12px"
  group: "16px"
  card: "24px"
  section: "32px"
  page: "40px"
  page-wide: "64px"
---

## Overview

铁律 IRONLAW 是本地优先的力量训练档案：记录每组重量、次数、时长与主观用力，回看真实训练轨迹。界面属于 Operate，不是营销页。视觉语言是石墨/象牙纸、细网格、微颗粒、单点青柠和工程刻度；信息密度、可读性和触控确定性优先于装饰。

## Brand

- 中文名：铁律；英文：IRONLAW。
- 标记：四片杠铃片 + 一根青柠横杆；可在 28px 顶栏、44px 侧栏和 1024px 应用图标中使用。
- 品牌语气：克制、精确、长期主义。保留「每一组，都算数。」作为训练价值主张。
- 技术标识 `com.jianlibao.app`、数据库名、备份 `app: "jianlibao"` 与云同步命名保持不变，避免破坏既有数据。

## Colors

以 `src/styles/tokens.css` 为唯一令牌源，`src/styles.css` 只负责导入；`ironlaw.css` 负责品牌、外壳、共享控件和跨页面的最终覆盖。两套主题都使用 10 个基础角色（页面、四层表面、三级文字、控件边线、强调色），hover/active、透明描边、disabled 与语义状态另列。强调色只用于主操作、当前状态、进度和少量刻度，不做整页铺色。

暗色正文至少 4.5:1，控件边界至少 3:1；浅色主题使用暖纸底而非纯白。热图与训练日历必须同时显示数字/文字，不只依赖颜色深浅。

## Typography

字号固定为 11/13/16/18/22/26/40px，不引入流式 clamp。字重只使用 400/600/700；中文不使用斜体或负字距。数字统一等宽，正文启用 tabular-nums。系统字体栈优先 MiSans / HarmonyOS Sans SC / PingFang SC / Noto Sans SC / Microsoft YaHei UI，不下载中文 Web Font。

页面标题 26/700；区块标题 22/700 或 18/600；正文 16/400，辅助 13/400，微标签 11/400。统计页核心数字40px、单位13px；手机今天页三项紧凑概况使用26px、单位11px。英文微标签使用 0.14–0.28em 字距，中文标题保持 0.01em 内的轻微字距。

## Layout

桌面 252px 侧栏 + 主工作区，最大 1720px；页面顶部有统一标题、说明、保存状态和主题切换。手机隐藏侧栏，使用五项底导航；页面标题保留 26px，并在标题左侧显示小号品牌标记。所有页面沿用原 hash 路由和原 props，不改变 IA。

## Surface & Texture

页面底图使用 96px 主网格和极低对比度径向光；Today 使用 24/96px 双层网格与更强 hero 纹理。卡片使用16/24px令牌圆角、1px微边线、3px微颗粒和顶部内高光；hero使用内嵌细框、四角刻度和标尺。浮层阴影克制使用，不用阴影代替控件边界。

## Shapes

圆角按角色区分：小标记6px、按钮/输入10px、卡片16px、大表面24px、圆形控件9999px。所有主要触控目标至少44px。间距沿用4px网格；页面大间距40/64px，卡片内24px，区块间32px。

## Components

- 主按钮：青柠实底 + 深色文字；同一视图通常只保留一个主按钮。
- 次按钮：透明底 + 强边线；ghost 仅用于低层级操作。
- 分段控件：surface-2 轨道 + surface-4 选中块；进度页 tab 保持 22px（≤359px 为 18px）。
- 卡片：真实层级才使用；列表与数据优先用分隔线和留白。
- 开关：44×24px 胶囊，选中青柠；复选：20px 方框，选中青柠 + 深色勾。
- 表单：标签在输入上方，输入 16px，聚焦青柠环；错误文字在下方。
- 模态：24px令牌圆角、模糊遮罩、固定底部操作；保留原生焦点约束与滚动。
- 空状态：真实说明 + 可执行下一步，不使用假数据。

## Motion

运动系统集中在 `src/styles/motion.css`、`src/styles/ironlaw.css`，最终交互与减弱动效覆盖位于`ironlaw-refinements.css`。新增控件反馈120ms，有限品牌入场280ms，列表错峰总量不超过300ms，位移不超过8px；使用cubic-bezier，不新增CSS linear()弹簧。

侧栏图标使用 `NavIcon`：路径 `pathLength=1`，悬停/激活时以 `stroke-dashoffset` 描线，激活时叠加轻微 scale pop；图标颜色从三级文字切到青柠。品牌标记悬停旋转 4°，主题按钮按下旋转 18°，保存中状态点呼吸。页面切换沿用现有 View Transitions/WAAPI 降级。

`prefers-reduced-motion: reduce` 下移除位移、光斑、磁吸、描线、旋转和滚动数字，只保留颜色/透明度反馈。

## Do's and Don'ts

先验证真实训练任务，再完善细节。保留真实输入、历史快照、导入边界、离线/只读/错误恢复和原生键盘作用域；不加入假历史、假纪录或用热身组推高统计。未经用户要求不迁移框架、不加入账户/远端依赖。品牌重做只改展示层，不改数据、备份、同步与原生 bundle 标识。
