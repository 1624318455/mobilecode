# 计划：全屏表格头 / 下载分享修复 / 长按菜单对齐业界做法

日期：2026-10-08（BUILD `20261008-uxaudit2` 之后）
状态：计划中，未开工。本文件是唯一依据，一项一项按顺序做，做完一项勾一项。

## 0. 用户实测结论（输入）

- 横滑 OK，复制 OK，回到底部 OK——这三项冻结，不再动。
- 下载分享有问题：点系统分享里的「保存到文件」显示保存失败。
- 全屏界面要做成截图形态：左返回，右复制、下载分享、旋转屏幕；旋转后观察 UI 是否正确。
- 长按菜单「选择文本」实现有问题；把菜单里所有操作（复制/选择文本/朗读/分享）对照开源实现与业界通用做法，不一致的参照改。

## 1. 调研结论（已完成，有来源）

### 1.1 下载/保存失败根因

- 现状：`MarkdownContent.tsx` 写 `cacheDirectory/*.tsv`（`file://`，应用私有目录）→ `Share.share({ url })`。
- RN 官方文档里 `Share.share` 是分享**文本**的 API，不是文件导出；Android 上私有目录 `file://` 跨应用不可读是已知病因（expo/expo#5933；react-native-share#431/#1543）。
- 业界标准矩阵（Tavily pro research，来源见文末）：
  - Android「保存到文件管理器」：`expo-file-system` StorageAccessFramework 流程——`requestDirectoryPermissionsAsync` → `createFileAsync(dir, name, mime)` → 写入用户选定的位置。这是唯一为「用户选址保存」设计的 API。
  - Android 简单分享给别的 App：`expo-sharing shareAsync`，MIME 显式传 `text/tab-separated-values`；URI 用 `content://`（`getContentUriAsync` 转）而非裸 `file://`。
  - iOS：`shareAsync` 调系统 share sheet，自带「存储到文件」，继续走分享即可。
  - RN core `Share.share` 只保留给纯文本分享（长按菜单的文字分享那条不动）。
- 推论：用户点的「保存到文件」失败 = 分享 sheet 的目标 App 读不到我们私有 `file://`，符合预期，不是偶发 bug，必须换主路径。

### 1.2 全屏头 + 旋转

- 业界通用头布局（Mux 视频播放器文档、Expo ScreenOrientation 文档）：左返回，右动作组；表格场景动作组 = 复制 / 下载分享 / 旋转。
- 标准实现 = `expo-screen-orientation`：`lockAsync(LANDSCAPE)` / 切回 `PORTRAIT_UP` / 关闭时 `unlockAsync`；配 `addOrientationChangeListener` 做布局跟随；iOS 切后台时 `AppState` 解锁兜底。
- 前置条件：本项目 `app.config.ts` 的 `orientation: "portrait"` 必须放开到 `"default"`，否则锁横屏会被系统拒绝；Android 需确认 activity 不因旋转重建（Expo 默认模板已带 `configChanges`，开工时核对）。
- 平板/折叠屏：只做手机直板 + 监听跟随布局，不做分栏；超出部分明确不做。

### 1.3 长按菜单（复制/选择文本/朗读/分享）

- ChatGPT 官方做法（OpenAI 公告）：消息上 tap-and-hold → 菜单 → 「Read Aloud」；复制是整条复制（Medium UX 评测：tap-hold 选中，copy 弹整条）。
- 最完整 RN 聊天开源实现 gifted-chat：长按 → `@expo/react-native-action-sheet` 菜单 → 「Copy Text」→ clipboard。菜单形态 = 系统级 action sheet，不是自绘浮层。
- stream-chat-react-native #2107 方向：iOS 用原生 context menu（Zeego / react-native-ios-context-menu），动作表 = Copy/Flag/Pin/Delete/Reply 等按能力开关。
- 本项目现状差距：
  1. 「选择文本」：`selectablePartId` 只透到自绘规则的 Text（段落/标题），**表格 th/td 走默认渲染，selectable 到不了**——含表格的消息点「选择文本」等于没反应，这就是用户遇到的问题。另只有右上「完成」药丸，无进入提示。
  2. 菜单形态：自绘锚点浮层（`MessageActionMenu`），与 gifted-chat 的 action-sheet 做法不一致；iOS 上原生菜单体验更好，但自绘已稳定，是否替换要排期评估，不在本次默认范围。
  3. 复制/朗读/分享三条与业界一致（整条复制、Edge 朗读、文字分享），保留，只修 bug 不改形态。

## 2. 排期（按顺序，一项一做）

### P0-1 下载分享修复（Android SAF 主路径 + iOS shareAsync）

- [x] 安装依赖：`expo-sharing`、`expo-screen-orientation`（下项共用，一次装好）；确认 Expo SDK 57 下 `StorageAccessFramework` 可用（legacy import 现状是 `expo-file-system/legacy`，SAF 位需要在新 API 面核对）。
- [x] 表格下载按钮逻辑改为：Android → SAF（选目录 → `createFileAsync(name, text/tab-separated-values)` → 写入 → 成功 toast/提示）；用户取消则回落到 `shareAsync`；iOS → `shareAsync`（系统面自带存文件）。
- [x] 文件名：`table-YYYYMMDD-HHmm.tsv`，MIME 统一 `text/tab-separated-values`。
- [ ] 验收：Android 分享面点「保存到文件」真实落盘（文件管理器可见）；iOS 存文件可见；无权限/取消不崩、有提示。

### P0-2 全屏头改成截图形态

- [x] 头部：左返回（关闭 + `unlockAsync` 回竖屏），右复制 / 下载分享（复用 P0-1 后的同一函数）/ 旋转（横竖 toggle）。
- [x] 标题保留「表格 · {n}列」。→ 审批变更：去标题，与截图一致；列数提示仅留内联卡片头。
- [x] 前置：`app.config.ts orientation` → `default`；聊天页挂载锁竖屏保旧行为；表格加纵向列分隔线。
- [ ] 验收：旋转后表格区重排正确、无遮挡、字不糊；关闭恢复竖屏；后台切回不卡死在横屏（iOS AppState 兜底）。

### P0-3 「选择文本」修复

- [ ] 方案（业界做法是原生可选文本，本项目对应物是 `Text selectable`）：把 `selectable` 穿透到表格默认渲染——给 `react-native-markdown-display` 补 `th/td`（及 `tr` 内文本）规则，或将整表包一层可选中容器；以最小改动、经过真机验证为准。
- [ ] 进入选择模式给明确 affordance（沿用「完成」药丸 + 系统选区手柄即足够，不加新 UI）。
- [ ] 验收：纯文本消息与含表格消息都能进选择态、能复制选区、能退出；表格格子文本可被选中。

### P1 长按菜单其余项核对（只对齐，不重构）

- [ ] 复制：保持整条复制 + 成功触觉（与业界一致，无需改）。
- [ ] 朗读：保持 Edge 整条朗读（ChatGPT 对齐项，无需改）。
- [ ] 分享：保持纯文本 `Share.share({ message })`（RN 官方用法，无需改）。
- [ ] 菜单形态（自绘浮层 vs action-sheet/原生菜单）：本次不动，记为后续可选债；若 P0-3 发现自绘层与原生选区手柄冲突，再升级此项。

### 明确不做

- 首列 sticky、>7 列转卡片、逐词 fade（理由见上一轮结论）。
- 平板分栏/折叠屏适配。
- 下载进度条/后台下载（表格 TSV 体积小，无必要）。

## 4. P2 表格显示效果优化（2026-10-08 第二轮）

来源：Tavily mini research（Markwon ext-tables、Streamdown styling、react-native-markdown-display README）+ 用户实测。

- [x] 表头双灰：按钮功能列（卡片头栏）与表格表头行（th）统一用浅灰底。实现：`surfaceContainer` token（深色模式自动变深灰，不写死 `#f0f4f8`），用户气泡内用 `onContainer 12%` 同代码块逻辑。
  → 修正（用户实测蓝）：`surfaceContainer` 带 M3 种子色偏蓝，改 `onSurface 8%` 中性灰，两处（th 底 + 卡片头栏）同公式，深色模式自动成深灰。
- [x] 等宽列：th/td 加 `flexBasis: 0`（Yoga 下 `flex: 1` 的 basis 默认 auto，会按内容分 fat，这是之前不等宽的根因；等价于 CSS `table-layout: fixed`，Markwon ext-tables 同款行为）。
  → 修正（用户实测行间仍不等）：真因是 AI 常丢尾部管道致参差行，短行按更少格子平分。加 parse 期 `padTableRows`（`lib/markdownTables.ts`，同任务列表字形替换模式，代码围栏不动、超宽行不截数据），node 实测 5 类用例通过。
- [x] 内联标题只留「表格」两字，去掉列数/横滑提示（全屏头已无标题）。
- [x] 调研对照结论（其余项与业界一致，不动）：任务列表 parse 期字形替换（☐/☑）正是推荐做法；代码块语言头+复制（Streamdown CodeBlockHeader/CopyButton 同款）；链接走外部浏览器（应用内 WebView 是更大功能，本次不做）；正文字号 15/22（业界 16/1.5，差 1pt 不值得动全聊排印）；图片固定高（FastImage/宽高比属性能优化项，记债不做）。

## 3. 来源

- Tavily pro research：Android SAF vs Share vs expo-sharing（含 expo#5933、react-native-share#431/#1543、Android FileProvider 文档、Apple UIActivityViewController）。
- Tavily mini research：expo-screen-orientation 全屏 viewer 标准实现（Mux orientation 文档、Expo ScreenOrientation/app-config 文档、expo#43692）。
- gifted-chat README（action-sheet 复制模式）、stream-chat-react-native#2107（原生菜单方向）。
- OpenAI 官方 Read Aloud 公告（LinkedIn）、Medium ChatGPT App UX 评测（tap-hold 选中/整条复制）。
- 本项目实测：用户真机（保存失败、选择文本无效、回到底部 OK）。
