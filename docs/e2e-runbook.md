# MobileCode 真机 E2E 手册（2026-10-01 实测沉淀，2026-10-03 按 v2 修订）

> 平台：Windows 11 + 无线 adb。含 Windows 特有写法（PowerShell、`adb pair` 文件重定向、
> 盘符路径），Mac 机按自己环境翻译，命令级内容不可照抄。

用 Maestro MCP + adb + 本地 `opencode serve` 在真机上跑端到端回归。
无 Flutter 相关内容（本工程是 Expo RN，不需要 flutter-skill）。

## 1. 环境

| 项 | 值 |
|---|---|
| 手机 | REDMI K100 Pro Max，无线 adb，mDNS 名 `adb-ce0d7044-d9jp67._adb-tls-connect._tcp`，IP 经常变（2026-10-03 在用 192.168.5.20，注意 .20:43607 是**手机无线调试端口**，不是 opencode 服务） |
| opencode serve | v2（`opencode serve --port 4096`，本地 CLI v2.0.22），本机常驻，健康检查 `GET /api/info`（要 Basic 鉴权，见 §5 表头 `$h`） |
| App 包名 | `io.memeflyfly.mobilecode`，直推 **release** 包（`bun x expo run:android --variant release`），不用 Metro |
| adb reverse | `tcp:4096 → tcp:4096`，App 内服务器地址填 `http://127.0.0.1:4096`（不随手机 IP 变） |
| Java | `D:\Java\jdk-17`（Maestro 需要 17+） |
| Maestro CLI | `C:\Users\memeflyfly\maestro`，opencode 全局配置已接 `maestro` MCP（java 直调 + `--no-viewer`） |

## 2. 连手机（配对已删/掉线时）

`adb pair` 在 Windows 下吃不了管道（必 `protocol fault`），必须文件重定向喂**精确字节**：

```powershell
[IO.File]::WriteAllText("C:\Temp\paircode.txt", "六位码`n")
cmd /c "adb pair 192.168.5.20:配对端口 < C:\Temp\paircode.txt"
```

- 配对码 1 分钟内会过期，拿到就跑。
- 配对成功后设备以 mDNS 名出现（`adb devices` 状态 `device`）。
- 手机端会弹 Maestro 驱动包安装确认 + App 装包确认，都要点允许。
- debug/release 签名互斥：换 variant 必须 `adb uninstall io.memeflyfly.mobilecode`（会清 App 数据，需重加服务器）。

## 3. 发版装机

```powershell
C:\Users\memeflyfly\.bun\bin\bun.exe x expo run:android --variant release
adb -s <device> install --user 0 android\app\build\outputs\apk\release\app-release.apk
adb -s <device> reverse tcp:4096 tcp:4096
adb -s <device> shell am start -n io.memeflyfly.mobilecode/.MainActivity
```

发版前对 `lib/buildInfo.ts` 的 build 号，诊断页截图留证。
**工作区有未提交的 v2 改动时必须重走本节**：2026-09-27 的装机包早于 v2
改动，直接测会测到旧二进制。`adb reverse` 重连/重启后会掉，跑前必
`adb reverse --list` 确认，有空就重打一次。

## 4. Flow 目录（`.maestro/`）

- `smoke.yaml`：launch + 断言"最近"。注意 `launchApp` 在 MIUI 上可能只报 COMPLETED 但没切前台，
  失稳时先 `adb shell am start -n .../.MainActivity` 再跑断言。
- `recents.yaml`：断言最近页 + 服务器分组头（`.*个会话.*`计数，注意 Maestro 是
  全字串正则，裸串匹配不上“87 个会话”；分组头是**服务器名**，
  不是“本机”，2026-10 按现 UI 修过）。需要至少一个会话才有分组，空库跑会挂，
  不是无条件幂等——先走 §5 staging 再跑。
- 活链路（红点/审批/TTS）需要服务端先 staging，见 §5，不适合存纯静态 flow。

Maestro 文本匹配是**全字串正则**：`tapOn: "添加服务器"` 在标题和按钮重名时会点到标题，
按钮一律用层级 dump 出来的 bounds 中心点坐标。

## 5. 活链路 staging（PowerShell，v2 接口）

> v2 要 Basic 鉴权（用户名 `opencode`），先备表头 `$h`。密码不在环境变量里，
> 默认从本机 service 文件取（只跑一次）：
>
> ```powershell
> $pw = (Get-Content $env:USERPROFILE\.config\opencode\service.json | ConvertFrom-Json).password
> $env:OPENCODE_SERVER_PASSWORD = $pw
> ```
>
> v2 ModelRef 是 `{"providerID","id"}`（注意会话 model 用 `id`，而模型列表
> 条目同时带 `id`/`modelID`，两者值相同）；`prompt` 不带 agent/model，
> 发之前用建会话/switch 对齐；`question` 已删除，对应的是按会话拉
> `form`；`abort` 改名 `interrupt`；所有路径加 `/api` 前缀。
> 原始 REST 返回都包一层 `{"data": ...}`（SDK 自动解包，手写
> `Invoke-RestMethod` 必须取 `.data`，见下）。

```powershell
$h = @{"Authorization" = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("opencode:$env:OPENCODE_SERVER_PASSWORD"))}
$b = '{"location":{"directory":"D:/mobilecode"},"model":{"providerID":"opencode","id":"muse-spark-1.3-contributor-free"}}'
$s = Invoke-RestMethod http://127.0.0.1:4096/api/session -Method Post -Body $b -ContentType "application/json" -Headers $h
$id = $s.data.id  # v2 包了一层 data，写 $s.id 会拿到 $null，后续 prompt 必 404
# staging 用纯 ASCII，避免 WinPS 5.1 中文编码坑（中文按下面 curl 法走文件）：
$b2 = '{"text":"REPLY EXACTLY: redot-test-ok"}'
Invoke-RestMethod "http://127.0.0.1:4096/api/session/$id/prompt" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($b2)) -ContentType "application/json" -Headers $h
```

中文 staging（必须走文件 + curl，`Invoke-RestMethod` 传中文必存成乱码，
实测 payload 变 `ֻ�ظ...`）：

```powershell
$utf8nb = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText("C:\Temp\prompt.json", '{"text":"只回复六个字：红点测试通过"}', $utf8nb)
$hstr = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("opencode:$env:OPENCODE_SERVER_PASSWORD"))
curl.exe -s -X POST "http://127.0.0.1:4096/api/session/$id/prompt" -H "Authorization: $hstr" -H "Content-Type: application/json" --data-binary "@C:\Temp\prompt.json"
```

- **建会话时定 model**（`prompt` 无 model 参数）；之前塞过坏 model 的会话删了重建。
- 坏 model（`{"providerID":"openai","id":"no-such-model-xyz"}`）发出去静默无 run，
  别拿它测 retry。
- 中止 run：`POST /api/session/{id}/interrupt`（空跑返回 `{"interrupted":false}` 即通）。
- 查挂起审批：`GET /api/session/{id}/permission`（回 `{"data":[]}` 即通）。查表单：`GET /api/session/{id}/form`。查消息尾：`GET /api/session/{id}/message?limit=200&order=desc`（回 `{"data":[...],"cursor":{...}}`）。
- 查忙闲：`GET /api/session/active`（回 `{"data":{...}}`，有 key 即 busy，value 形如 `{"type":"running"}`）。

## 6. 血泪陷阱

1. **`hideKeyboard` 在键盘已收起时 = 按返回键**：会无声退出表单导致白填。
   只在刚 `inputText` 完（键盘必定弹起）后调用，提交前不再调用。
2. **表单按钮坐标以层级为准**，不要目测截图（曾把 y≈1895 看成 1300，连点输入框）。
   同名标题/按钮（如两处“添加服务器”）用 `below:`/`above:` 锚定，裸 `tapOn` 必点错。
3. **自动化时手机放一边**：用户前台（B站/设置页）会盖掉断言，造成灵异失败。
4. 新会话进列表有延迟（分钟级），先等再下拉刷新，不要一上来就判失败。
5. 断言串用界面全串（如 `"提问 已答 1"` 整体），单个词多半匹配不上。
   计数类（`87 个会话`）必须写成 `.*个会话.*`，裸串永远匹配不上。
6. **同 placeholder 的多输入框**（如两处“选填”）hint 常驻层级，`index: 0` 永远打中
   第一个：用户名用 `index: 0`，密码必须 `index: 1`（或 `below: "密码"` 锚定）。
7. **`eraseText` 不保证清空**（光标位置不定，只能删掉一部分）：脏字段先
   `eraseText: 100` ×2~3 再 `inputText`，截图确认干净后再测连接。
8. **测试连接按钮会变身**：点一次后文案从 `测试连接` 变成 `连接成功/连接失败`，
   复测要点新文案，旧文案直接 `Element not found`。
9. **消息翻页禁止 `order`+`cursor` 同传**（服务端 400
   `Cursor cannot be combined with order`，App 曾因此整页报错）：
   首页带 `order`，翻页只带 `limit`+`cursor`。

## 7. 2026-10-01 实测结论

通过：红点亮/灭、活审批提交（选周四→已答→agent 继续）、TTS 外放（logcat 有本 App
`music_playback` 记录）、配色渲染、诊断监听行、服务器增删改连。
未覆盖：retry 化石显示分支（造不出可见失败态，只验证了隐藏侧）、过期条 live、
后台系统通知（MIUI 冻结，本地无解，见 wiki 实录）。

## 8. 2026-10-03 v2 全量实测结论（build `20261002-v2-e2e-fix1`）

- 先修文档再测：§5 有两处照抄必挂（`$s.id`→`$s.data.id`；中文 staging 经
  `Invoke-RestMethod` 必乱码，改走 ASCII + curl 文件法），已改完才开测。
- 通过：`smoke.yaml`、`recents.yaml`（顺手把过时的 `本机` 断言改成 `.*个会话.*`，
  分组头本就是服务器名）；服务器新增→`连接成功`→保存；活 prompt→`redot-test-ok`
  回包；红点亮（列表红点）/灭（进会话后消失）；会话 transcript 渲染
  （user 气泡 + assistant 文本）；TTS 朗读（logcat 本 App `music_playback`，
  speaker 外放）；诊断页网关/监听/运行日志/`build` 号留证；服务器删除
  （删掉 401 僵尸 MyWin，`assertNotVisible` 过）。
- 真 bug 一枚并已修：`useSessionMessages` 翻页把 `order`+`cursor` 同传，
  会话页直接红字 `Cursor cannot be combined with order`（`hooks/useSessionMessages.ts`，
  首页带 order、翻页只带 limit+cursor，`tsc` 干净，已重发版复验通过）。
- 未覆盖：活审批提交、form 活提交（见 §9）、retry 化石分支（见 §9）、后台系统通知
  （见 §9，MIUI 下依然无解）。

## 9. 2026-10-03 剩余项补测结论（build `20261003-v2-retry-fix`）

###  staging 新配方（SDK 直调，比裸 REST 稳）

审批（关键两点：action 必须是**工具名** `shell` 而不是 `bash`；
`prompt` 在审批挂起时**不返回**，staging 脚本里不许 `await`）：

```ts
const created = await client.session.create({
  location: { directory: "D:/mobilecode" },
  model: { id: "muse-spark-1.3-contributor-free", providerID: "opencode" },
  permissions: [{ action: "shell", resource: "*", effect: "ask" }],
});
void client.session.prompt({ sessionID: created.id, text: "…" }); // 不 await
// 轮询 client.permission.list({ sessionID }) 等 request 出现
```

表单（直接建，不依赖 agent 提问）：

```ts
const form = await client.session.form.create({
  sessionID, title: "E2E Form Probe",
  fields: [
    { key: "weekday", title: "Weekday", type: "string", required: true,
      options: [{ value: "thu", label: "Thursday" }], custom: false },
    { key: "confirm", title: "Confirm submit?", type: "boolean" },
  ],
});
```

### 通过

- **活审批提交**：ask-shell 会话 prompt 后 `permission.list` 出现 request；
  App 内横幅（`shell` + `$ 命令` + 拒绝/带反馈拒绝/总是允许/允许）与消息流内联卡
  同时出现；点横幅`允许`（有两个“允许”时用 `index: 1` 取横幅那个）→ agent 继续，
  回包 `PERM-PROBE-OK`，横幅消失。v2 对应 10-01 的“选周四→已答→agent 继续”。
- **form 活提交**：横幅渲染标题 + 选项 + 是/否 + 忽略/提交（必填未答时提交置灰）；
  选 Thursday→是→提交→横幅消失，服务端 `form` 列表回到 `{"data":[]}`。
- **过期条 live**：错密码服务器行显示`需要重新配对` + `重新配对该设备` CTA；
  同一轮顺带验了重命名（`设备选项`→`重命名`→`保存`）与删除本地记录。
- 工具错误卡渲染（`shell 出错 / Tool execution interrupted`）。

### 发现的问题与修复（已依次修完，`tsc` 干净并重发版复验）

1. **retry 条在 v2 永远显示不出来**：`SessionActive` 只有 `{type:"running"}`，
   轮询永无 retry，而 `showRetryBar` 却以轮询 `state === "retry"` 为门禁——
   化石分支在 v2 已死。修：`SessionChatContent` 改存 live SSE
   `session.status(retry)` 的 `{message,next,at}` payload，
   `showRetryBar` 改由 busy + live 证据驱动，化石防护（terminal/user/activity/idle
   覆盖即藏）保留。真 quota 重试事件到时即显示，平时保持隐藏（已回归验证）。
2. **审批横幅标题裸 `shell`**：`getPermissionLabel` 只认 `bash`，补 `shell`
   同映射到`执行命令`。
3. **无人理的审批约 20 分钟后服务端中断 run**（`aborted / Step interrupted`，
   permission 清空）：staging/测试必须在挂起后尽快点掉，不要放着。
4. **坏 model 依旧静默无 run**（无 assistant 消息、无 active）：别拿它测任何分支。
5. **Maestro 重装驱动会被 MIUI 拦一次**：跑 flow 前看一眼手机点允许即可。

### 仍未覆盖（判死，本地无解）

- **后台系统通知**：App 切后台 60s 后 run 完成，`dumpsys notification`
  只有 `alive` 前台服务通知，没有 `replies` 通知——MIUI 冻 JS 线程，
  10s 轮询的 reply watcher 在后台根本跑不起来。修要把轮询搬进原生
  `AliveService`（要凭据/会话跟踪/deep-link，量级大且 MIUI 仍可能杀），
  本轮不做，保持 10-01 结论。

## 10. 2026-10-05/06 Mac 真机实测补充（send-stop + 设置路由，build `20261005-objpush`）

本节命令全部在 macOS 下验证过，与 Windows 章节逐条对应，IP/密码以本机为准。

### 环境差异

| 项 | Mac 实测值 |
|---|---|
| 手机 | 同一台 REDMI（`adb-ce0d7044-d9jp67._adb-tls-connect._tcp`，IP 仍常变） |
| 配对 | Mac 下管道喂码可用：`echo "六位码" \| adb pair IP:配对端口`（Windows 才需文件重定向） |
| opencode serve | 本机常驻 `--service`，端口动态（实测 `49374`，`lsof -iTCP -sTCP:LISTEN` 查），密码见 `~/.config/opencode/service.json` |
| App↔服务 | `adb reverse tcp:4096 tcp:49374`（手机侧 `http://127.0.0.1:4096` 不变，直通 Mac 服务；`reverse --list` 为空就重打，掉线/重启必掉） |
| 终端代理 | xray 在 `127.0.0.1:10808`（HTTP 与 SOCKS5 均通），写入 `~/.zshrc` 常驻；注意该代理回源 `dl.google.com` 全是假 404，只能走国内镜像 |
| bun | 原机没有，`curl -fsSL https://bun.sh/install \| bash`（走代理），再 `bun install` |
| maestro CLI | `brew install maestro` 只给 Studio（Electron 壳）；真 CLI 从 GitHub release 取：`maestro.zip`（`cli-2.11.0`，`~/.maestro/maestro/bin/maestro`）。**MIUI 上跑不起来**：driver 安装被 `INSTALL_FAILED_USER_RESTRICTED` 拦且无弹窗，本轮改用 adb+uiautomator+截图 harness（见下），flow 文件仅留作 Windows 机用 |

### 构建（Mac 从零编 release，巨坑，逐个已踩平）

1. `bun x expo run:android --variant release` 前必 export：`ANDROID_HOME=$HOME/Library/Android/sdk`（否则 `SDK location not found`）。
2. NDK 27 下不下来（sdkmanager 连不上 google）：本机只有 NDK 28，`android/`（git-ignored，不入库）里改用 28——`android/gradle.properties` 加 `ndkVersion=28.2.13676358` **不够**（expo-root-project 的 `setIfNotExist` 和 AGP 默认只认先声明的 ext），必须在 `android/build.gradle` **顶部**（`apply plugin: "expo-root-project"` 之前）写死 `ext.ndkVersion = "28.2.13676358"`，另在 `~/.gradle/init.gradle`（Groovy，KTS 里写不了动态类型）里给所有 `com.android.application/library` 模块强制 `ndkVersion`（AGP 8.5 默认 27，不装就 `NDK not configured`）。
3. 依赖下载：`~/.gradle/init.gradle.kts` 里 settings 层换国内镜像（aliyun google/central 在前，tencent 在后）**不够**——included build（expo-gradle-plugin）和自带 `repositories { google() }` 的子模块（settings-plugin、keyboard-controller、mmkv、nitro 等）无视 settings。做法：同样在 init 里 `allprojects` 前置镜像，仍有漏网就直改对应 `build.gradle(.kts)` 的 `repositories` 块（node_modules 改动不入库，`bun install` 会丢，重装依赖后重打）。
4. `~/.gradle/gradle.properties` 加代理 systemProp + 超时放宽 + 内存：`org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g`（默认 512M Metaspace 会在 lintVital 阶段把 daemon OOM 杀掉，进程直接消失无报错）。
5. `android/app/build.gradle` 的 `android { lint { checkReleaseBuilds false } }`（android/ 不入库）：跳过 release lint。
6. 签名：Mac 编的包与 Windows 包签名不同，`INSTALL_FAILED_UPDATE_INCOMPATIBLE` 时 `adb uninstall io.memeflyfly.mobilecode`（清数据，服务器要重配，见下）。

### 配对（App 数据被清后）

配对屏切到`配对码`法，`input text` 逐个填（`input tap` 只管聚焦，`TAB(keyevent 61)` 切下一个框最稳；地址框若有残留先点尾部再按 `KEYCODE_DEL` 删——点中部会把光标放中间）：
origin `http://127.0.0.1:4096`，code 任意填（OpenCode 不校验，只验用户/密码连通性），username `opencode`，password 取 Mac service.json。成功后设备行变`可达 • 上次连接刚刚`。

### UI 定位法（无 maestro 时）

- 首选 `adb shell uiautomator dump /sdcard/ui.xml` + pull 下来按 text/content-desc/bounds 精确定位（全屏正则，跑 Windows 版 trap #2 同理）。
- **busy/流式屏 dump 必挂**（`could not get idle state`，打字点动画停不下来）：改用颜色分割——截屏后 ffmpeg 裁/缩成 raw，用 python 按“蓝底白字”（B>100 且 B-R>40 且 B-G>20 且 R<150）找最大连通域，就是 `允许` 类按钮。截图目测只做辅助，禁止目测定坐标。
- 截图 PNG 即设备全分辨率（1200x2608），读图工具展示会缩小，按比例换算，不要臆测展示尺寸。
- 权限/审批横幅点不中时先查服务端状态（`/api/session/active`、`/permission`、`/form`）再动手：多数“点不中”是 run 已结束导致布局已变，不是坐标错。

### 睡眠 staging 配方（busy 窗口制造机）

```sh
PW=$(python3 -c "import json;print(json.load(open('$HOME/.config/opencode/service.json'))['password'])")
H="Authorization: Basic $(echo -n "opencode:$PW" | base64)"
S=$(curl -s -m 15 -X POST http://127.0.0.1:49374/api/session -H "$H" \
  -H "Content-Type: application/json" --data-binary \
  '{"location":{"directory":"/private/tmp/e2e-sendstop"},"title":"send-stop-e2e","model":{"providerID":"opencode","id":"muse-spark-1.3-contributor-free"},"permissions":[{"action":"shell","resource":"*","effect":"allow"}]}')
ID=$(echo "$S" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['id'])")
curl -s -m 60 -X POST http://127.0.0.1:49374/api/session/$ID/prompt -H "$H" \
  -H "Content-Type: application/json" --data-binary \
  '{"text":"Use the shell tool to run exactly this command: sleep 90. Wait for it to finish, then reply with exactly SLEEP90-DONE."}'
```

- 要点：`sleep 90`（太短来不及点，`sleep 600` 会被模型拒掉：“10-minute blocking sleep would stall this session”——模型原话）；permissions 用 allow 免审批；建完立刻进会话页等 busy（LLM 首轮 30~90s）。
- 审批 staging：建会话时 permissions 用 `ask`，prompt 里让它调 shell；表单直接 `POST /api/session/{id}/form` 建（字段见 §9）。
- **staging 完删会话**（`DELETE /api/session/{id}`）+ 删临时目录，保持服务端干净。

### 本轮结论（20261005-objpush，截图留证于 `/tmp/opencode/*.png`，随包不入库）

- 通过：忙时发送键变红 stop（空输入可点）→点即中断（active 清除 + `Tool execution interrupted` + 按键恢复）；设置页 idle/busy 都能进（模型/重命名/分支继续/压缩历史/删除常驻，busy 多一个带二次确认的中止）；中止确认框→中断生效→按钮消失；活审批允许→继续→回包；表单选 Thursday→是→提交→清空；fork 成功并落地新会话（含空会话被拒且报错上屏）；compact 落 `compaction` 标记；重命名保存生效；删除走确认框→服务端消失→路由退回；TTS 自动朗读播 ~2s（AudioTrack 日志）；配对/最近分组/诊断网关监听日志/build 号。
- 真 bug 两枚（都已修，见 git log）：① 齿轮进设置页 404——根布局 Stack 漏注册 `settings/index`（`69c2b82`，后证为显式化，真正病根见②）；② **编码 projectId 必现 404**——项目页入口用合成 id（含 `%2F`）时聊天页能进（整段命中），但齿轮按解码值重拼 URL 就多出 `/`。齿轮/fork/rescue 三处改对象式 `pathname+params` push（`0b3cccf`），entry 侧（RecentRow/drawer/ProjectSessions/未读）暂不动——它们进聊天页今天是通的，动了反而有风险，列入下轮。
- 未覆盖：rescue 卡（造不出加密 reasoning 失败）、quota retry 真事件、后台通知（历史判死结论不变）、maestro framework（MIUI 拦 driver）。

## 11. 2026-10-06 二维码扫码配对（真机问题驱动 + 行业调研）

### 背景

`opencode pair` 既打链接又打二维码，但 App 的“二维码”法只是一个粘贴框——用户实测反馈两条：
1. 扫码成功失败都没有任何提示；
2. 扫完（疑似成功）直接回配对页，无事发生：不配对、不跳转、无记录。

### 调研结论（NN/g、uxpatternsguide、WhatsApp/Expo Go 设备流）

- 状态必须用**文字**宣布，不能只靠动画/震动：scanning → decoded → validating → pairing → success/fail，每步可见。
- 解码成功≠任务成功：扫码只是漏斗第一步，要度量到任务完成（配对成功/失败），不能停在“扫到了”。
- 解码载荷先**校验**再动作：非配对内容、过期/已用链接要有具体可操作的报错（“不是配对码”“链接过期，重打一个”），不能是通用失败或沉默。
- 扫码这种用户明确点“扫描”发起的**配对**动作，业界标准是自动继续（WhatsApp 关联设备、Expo Go、RFC 8628 设备流都是扫完自动走，附带进度），而不是扫完让人再找按钮——静默回表单是明确的反模式。
- 相机拒绝要有退路（切链接/配对码），扫码框内允许重扫（invalid 不关框）。

### 落码（`e972423` 之后）

- `handleBarcodeScanned` 先用 `isPairConnectLink` + `parseQrPayload` 复刻 `pairWithQr` 的接受集做门禁：非法内容→错误震动＋框内红字（`pair.scanInvalid`）＋1.5s 后放行重扫，不关框；
- 合法→成功震动→关框→`scannedOk` 预览→**自动调起配对**（loading 落在配对按钮上），成功进设备页，过期/已用走既有 `translateError`（`linkUsed` 等）红字；
- 扫码成功/配对失败都有文字状态，相机拒绝指向链接/配对码 tab。

### 测试场景（本轮可跑 vs 需人手）

| # | 场景 | 方式 | 断言 |
|---|---|---|---|
| Q1 | 二维码 tab 只有扫码入口（无粘贴框） | 真机截图 | 有扫描按钮，无输入框 |
| Q2 | 拒绝相机权限 | 真机点拒绝 | 红字提示切链接/配对码 |
| Q3 | 过期/已用链接配对失败 | 真机：链接 tab 粘**已用过**的一次性链接→配对 | `linkUsed` 红字（链接过期或已用） |
| Q4 | 非法内容扫码 | 代码走读＋门禁逻辑与 `pairWithQr` 同函数 | 非法不触发配对、不关框（光学步需人手） |
| Q5 | 合法扫码自动配对 | 人手 10 秒：`opencode pair` 终端码→App 扫 | 自动进设备页，可达 |
| Q6 | maestro MCP 联通 | 本机 `list_devices` | 工具可调（MIUI 真机仍被拦，见 §10） |

Q1/Q2 已随上轮验证；本轮跑 Q3（失败反馈链）＋Q6（MCP 联通）。

### 官方 QR 格式结论（2026-10-06，已实证，无需格式适配）

- 从本机 opencode 二进制抽出 `pair` 实现：`server.pair()` 取一次性 code → 对每个服务地址拼 `new URL('/auth/connect/'+code, origin)` → 打印链接＋同一字符串的二维码。**官方 QR 内容 == 链接本身**，没有第二种格式。
- 用户真机扫码已证明我方解析链走通：扫后直接尝试赎回并报出链接里的 origin（`ConnectException ... 127.0.0.1:49374`），失败点在该 origin 手机不可达（`pair` 默认打的服务端口），不在格式。
- 结论：不需要等官方适配，也不需要我方加格式分支；要做的是 origin 不可达时的人话报错（已做：`translateError` 网络映射＋cameraNote 的 `--url` 指引）。
