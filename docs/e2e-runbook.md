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
