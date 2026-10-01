# MobileCode 真机 E2E 手册（2026-10-01 实测沉淀）

用 Maestro MCP + adb + 本地 `opencode serve` 在真机上跑端到端回归。
无 Flutter 相关内容（本工程是 Expo RN，不需要 flutter-skill）。

## 1. 环境

| 项 | 值 |
|---|---|
| 手机 | REDMI K100 Pro Max，无线 adb，mDNS 名 `adb-ce0d7044-d9jp67._adb-tls-connect._tcp`，IP 经常变（曾用 192.168.5.20） |
| opencode serve | `127.0.0.1:4096`，本机常驻，健康检查 `GET /global/health` |
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

## 4. Flow 目录（`.maestro/`）

- `smoke.yaml`：launch + 断言"最近"。注意 `launchApp` 在 MIUI 上可能只报 COMPLETED 但没切前台，
  失稳时先 `adb shell am start -n .../.MainActivity` 再跑断言。
- `recents.yaml`：断言最近页 + 本机分组（幂等，随时可跑）。
- 活链路（红点/审批/TTS）需要服务端先 staging，见 §5，不适合存纯静态 flow。

Maestro 文本匹配是**全字串正则**：`tapOn: "添加服务器"` 在标题和按钮重名时会点到标题，
按钮一律用层级 dump 出来的 bounds 中心点坐标。

## 5. 活链路 staging（PowerShell）

建会话并发消息（注意目录用正斜杠）：

```powershell
$b = '{"directory":"D:/mobilecode"}'
$s = Invoke-RestMethod http://127.0.0.1:4096/session -Method Post -Body $b -ContentType "application/json"
$id = $s.id
$b2 = '{"agent":"build","model":{"providerID":"opencode","modelID":"muse-spark-1.3-contributor-free"},"parts":[{"type":"text","text":"只回复六个字：红点测试通过"}]}'
Invoke-RestMethod "http://127.0.0.1:4096/session/$id/prompt_async?directory=D:/mobilecode" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($b2)) -ContentType "application/json"
```

- **不指定 model 会沿用会话上次的 model**；之前塞过坏 model 的会话必须显式指定好 model。
- 坏 model（`{"providerID":"openai","modelID":"no-such-model-xyz"}`）发出去静默无 run，
  别拿它测 retry。
- 中止 run：`POST /session/{id}/abort?directory=D:/mobilecode`。
- 查挂起审批：`GET /question?directory=D:/mobilecode`。查消息尾：`GET /session/{id}/message`。

## 6. 血泪陷阱

1. **`hideKeyboard` 在键盘已收起时 = 按返回键**：会无声退出表单导致白填。
   只在刚 `inputText` 完（键盘必定弹起）后调用，提交前不再调用。
2. **表单按钮坐标以层级为准**，不要目测截图（曾把 y≈1895 看成 1300，连点输入框）。
3. **自动化时手机放一边**：用户前台（B站/设置页）会盖掉断言，造成灵异失败。
4. 新会话进列表有延迟（分钟级），先等再下拉刷新，不要一上来就判失败。
5. 断言串用界面全串（如 `"提问 已答 1"` 整体），单个词多半匹配不上。

## 7. 2026-10-01 实测结论

通过：红点亮/灭、活审批提交（选周四→已答→agent 继续）、TTS 外放（logcat 有本 App
`music_playback` 记录）、配色渲染、诊断监听行、服务器增删改连。
未覆盖：retry 化石显示分支（造不出可见失败态，只验证了隐藏侧）、过期条 live、
后台系统通知（MIUI 冻结，本地无解，见 wiki 实录）。
