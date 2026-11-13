# 铁律 IRONLAW

免费的个人训练记录应用。记录每组重量、次数、时长和 RPE，回看训练容量、动作纪录和身体趋势。内置动作筛选、中文讲解与休息计时，可离线记录和导出备份。

**[立即打开网页版](https://jianlibao-training-raitox.netlify.app/mobile/)** · 手机和电脑均可直接访问。

[下载 Web、Android 和 iOS 版本](https://github.com/Raito666/ironlaw-training/releases/tag/v0.4.0-20261113) · [图文使用说明](docs/USAGE.md) · [开发与自托管](docs/DEVELOPMENT.md)

**新版手机训练流程**。在底部原地记完当前组，休息计时继续，重开直接接上待记组。每组可查看并填入上次的成绩，历史里的「再练一次」会逐组带入。「今天」可以补练指定场次，联网后同步补练结果。[直达原图三分化完整版](https://jianlibao-training-raitox.netlify.app/mobile/#/plans?preset=photo-complete)

![铁律桌面版的训练主页，使用演示数据](docs/screenshots/desktop.png)

## 选一个版本

| 设备 | 下载项 | 使用方式 |
| --- | --- | --- |
| Windows、Mac、浏览器 | 新版 Web/PWA ZIP | 解压并启动本地 HTTP 服务。部署到 HTTPS 后可在手机上安装到主屏幕。 |
| 安卓 | 网页 PWA / Android APK | APK 适用于 Android 7.0 或更新版本，可覆盖上一公开 APK。Chrome 可把网页版安装到主屏幕。 |
| iPhone / iPad | 网页 PWA / 未签名 IPA | Safari 可把网页版安装到主屏幕。IPA 供开发者自行签名。 |
| Apple 芯片 Mac | iOS Simulator ZIP | 解压后用 Xcode Simulator 安装 `App.app`。 |

换设备前，可在原设备的「我」页导出备份，再在新设备导入。新版支持旧 v1–v3 备份。含逐场训练关联的 v4 备份及对应云同步记录需要更新各端。

## 新版手机训练

| 断网重开续练 | 保存结果 |
| :---: | :---: |
| <img src="docs/screenshots/training-offline.png" width="250" alt="320px 手机网页版断网续练，显示待记组和休息计时"> | <img src="docs/screenshots/training-saved.png" width="250" alt="训练保存结果与补写备注入口"> |

| Android 320dp | iPhone 16 模拟器 |
| :---: | :---: |
| <img src="docs/screenshots/android-training-resumed.png" width="250" alt="Android 断网重开后继续记录第 2 组"> | <img src="docs/screenshots/ios-training-resumed.png" width="250" alt="iOS 重开后恢复第 2 组、历史成绩和休息计时"> |

## 其他界面

| 精选模板 | 训练排期 |
| :---: | :---: |
| <img src="docs/screenshots/templates.png" width="250" alt="谭成义原图三分化完整版"> | <img src="docs/screenshots/schedule.png" width="250" alt="训练排期与改期入口"> |

| 训练记录 | 动作讲解 | 历史与统计 | 身体数据 |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/training.png" width="195" alt="训练中输入重量和次数"> | <img src="docs/screenshots/exercise.png" width="195" alt="杠铃卧推图解和详细讲解"> | <img src="docs/screenshots/statistics.png" width="195" alt="训练统计和容量趋势"> | <img src="docs/screenshots/body.png" width="195" alt="身体数据和趋势图"> |

截图使用演示记录。训练历史按实际保存的组数计算，支持补记及备份迁移。动作可按身体部位、器械、难度和记录方式筛选，包含 302 个原有 SVG 图解动作及 5,632 个扩展动作的文字讲解。

## 许可与署名

项目代码使用 [AGPL-3.0-or-later](LICENSE)。SVG、wger 媒体、openGym 文字和身体部位路径按各自条款分发。公开版的扩展动作提供文字，Gym Visual 独立授权的图片和视频未收录。详见 [逐项来源及署名](src/content/ATTRIBUTION.md)。
