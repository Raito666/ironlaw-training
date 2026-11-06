# 铁律 IRONLAW

免费的个人训练记录应用。记录每组重量、次数、时长和 RPE，回看训练容量、动作纪录和身体趋势。内置动作筛选、中文讲解与休息计时，可离线记录和导出备份。

[下载各平台版本](https://github.com/Raito666/ironlaw-training/releases/tag/v0.4.0-20261106) · [图文使用说明](docs/USAGE.md) · [开发与自托管](docs/DEVELOPMENT.md)

![铁律桌面版的训练主页，使用演示数据](docs/screenshots/desktop.png)

## 选一个版本

| 设备 | 下载项 | 使用方式 |
| --- | --- | --- |
| Windows、Mac、浏览器 | Web/PWA ZIP | 解压并启动本地 HTTP 服务。部署到 HTTPS 后可在手机上安装到主屏幕。 |
| 安卓 | Android APK | Android 7.0 或更新版本。下载 APK 后，用系统安装器打开。当前为原生预览版。 |
| iPhone / iPad | PWA 或自行签名 | 日常使用可通过 Safari 安装 PWA。Release 提供 iOS 未签名 IPA，可用于开发者自行签名。 |
| Apple 芯片 Mac | iOS Simulator ZIP | 解压后用 Xcode Simulator 安装 `App.app`。 |

所有下载包来自同一份 Web 资源。首次换设备前，可在原来的「我」页导出备份，再在新设备导入。

## 看看界面

| 训练记录 | 动作讲解 | 历史与统计 | 身体数据 |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/training.png" width="195" alt="训练中输入重量和次数"> | <img src="docs/screenshots/exercise.png" width="195" alt="杠铃卧推图解和详细讲解"> | <img src="docs/screenshots/statistics.png" width="195" alt="训练统计和容量趋势"> | <img src="docs/screenshots/body.png" width="195" alt="身体数据和趋势图"> |

截图使用演示记录。训练历史按实际保存的组数计算，支持补记及备份迁移。动作可按身体部位、器械、难度和记录方式筛选，包含 302 个原有 SVG 图解动作及 5,632 个扩展动作的文字讲解。

## 许可与署名

项目代码使用 [AGPL-3.0-or-later](LICENSE)。SVG、wger 媒体、openGym 文字和身体部位路径按各自条款分发。公开版的扩展动作提供文字，Gym Visual 独立授权的图片和视频未收录。详见 [逐项来源及署名](src/content/ATTRIBUTION.md)。
