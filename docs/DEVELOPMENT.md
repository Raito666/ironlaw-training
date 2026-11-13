# 开发与构建

铁律由 React、TypeScript、Vite 和 Capacitor 组成。Web 与 Android 用 IndexedDB 保存训练记录，iOS 使用 SQLite。各平台共用训练模型、历史快照和备份校验。

## Web 与测试

环境为 Node.js 24 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
npm --prefix server/opengym/api ci
pnpm dev
pnpm test
pnpm build
```

`dist/` 可部署在 HTTPS 站点根目录，手机入口为 `/mobile/`。直接双击 HTML 时缺少 HTTP 环境与离线服务。端到端测试默认使用 Windows Edge，运行前确认 `playwright.config.ts` 的浏览器路径。在没有 Gym Visual 素材的公开发行环境中，原素材播放矩阵明确标记为跳过，动作文字和可分发图解仍可单独测试。

可选加密云同步见 `netlify/functions/`。Web 站点和函数需同源，自托管前先安装函数目录的锁定依赖，再按 `netlify.toml` 部署。OpenGym 自托管连接的来源、运行方法与安全边界见 [服务端文档](../server/opengym/SOURCE.md)。Android 预览版与 iOS 通过原生 HTTP 接入可选的加密同步，OpenGym 自托管账号连接由 Web 提供。

## iOS 与 Android

在项目根目录构建同一份 `dist/`，再生成原生包。

```sh
pnpm build
bash scripts/package-ios.sh
bash scripts/package-android.sh
```

两条原生构建命令按所需平台分别执行。iOS 需要 Apple 芯片 Mac 和 Xcode 26，生成无签名模拟器 ZIP 与设备 IPA。真机安装用自己的 Apple 开发团队签名。Android 需要 JDK 21、Android SDK 36 与 Build Tools 36.0.0。脚本生成已对齐的未签名 APK，公开安装包在发布阶段使用维护者持有的签名生成。

模拟器构建使用当前应用专用的 Keychain 标识验证云同步。设备 IPA 使用安装者自己的开发团队签名。

若要直接打开工程调试，可执行 `pnpm exec cap sync ios` 或 `pnpm exec cap sync android`，再从 Xcode 或 Android Studio 运行。

## 发行边界

仓库收录应用源代码、构建配置、测试、可分发素材与许可。扩展目录提供 openGym 文字及作者信息，未分发 Gym Visual 动作图或视频。Android 原生为预览版，训练记录及可选同步功能按应用内页面提供，系统后台训练提醒和真机兼容性以各版本验收记录为准。
