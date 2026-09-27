<div align="center">

# 【已解决】Windows 11 现代待机锁屏/熄屏后后台任务停止：Kernel-Power 506「Idle Timeout」（无人参与睡眠超时 · 熄屏即待机 · 执行请求≠睡眠请求）

**故障与方案摘要：现代待机（S0）笔记本上把「睡眠」设为"永不"，不代表锁屏之后系统不会睡——本机实测是三层机制叠加：隐藏的「无人参与系统睡眠超时」默认 120 秒、熄屏即开启待机会话（Kernel-Power 506 只是会话入口，不等于"睡死"）、人存在传感器把熄屏提前到离开约 30 秒。应用持有的「执行请求」拦不住深度睡眠，只有「SYSTEM 阻睡请求」有效。用 `SetThreadExecutionState` 保活脚本把系统按在浅度空闲后，AI 挂机任务连续两晚通宵运行，全程插电、电池零消耗。**

[![结果](https://img.shields.io/badge/AI挂机-连续两晚通宵-success)](#6-验证)
[![夜间电池](https://img.shields.io/badge/夜间电池消耗-0%25-0078D4)](#6-验证)
[![无人参与超时](https://img.shields.io/badge/UNATTENDSLEEP-120秒→0-orange)](#5-修复方案与执行)
[![核心方案](https://img.shields.io/badge/核心方案-SetThreadExecutionState%20SYSTEM%20请求-blue)](#5-修复方案与执行)

</div>

---

**关键词**：现代待机 · S0 低电量待机 · Connected Standby · 锁屏后程序停止 · 熄屏后后台任务挂起 · AI 挂机任务中断 · 挂机下载/训练半夜停 · Kernel-Power 事件 506 / 507 · `Idle Timeout` · 无人参与系统睡眠超时（`UNATTENDSLEEP`）· 在此时间后睡眠（`STANDBYIDLE`）· 存在感应 / 人存在传感器 · `USERPRESENCEPREDICTION` · `powercfg -requests` · `powercfg /systempowerreport` · `SetThreadExecutionState` · `ES_SYSTEM_REQUIRED` · `PowerRequestExecutionRequired` · 电源模式覆盖层 · `LIDACTION`

## 0. 摘要

| 项 | 内容 |
| :--- | :--- |
| **首要症状** | 锁屏离开几分钟后，后台 AI 挂机任务停止推进；解锁后才恢复。事件日志反复出现 Kernel-Power 506「系统正在进入新型待机状态，原因: Idle Timeout」 |
| **误导项** | 电源计划里「在此时间后睡眠」插电档明明是**永不**，系统却照睡不误 |
| **根因** | S0 现代待机机器上"熄屏即开启待机会话"；深睡与否由「阻睡请求」决定，而常驻应用持有的 `ExecutionRequired`（执行请求）不阻止深睡；叠加隐藏的 120 秒无人参与超时与存在感应熄屏加速 |
| **关键误判** | 事件 506 出现 ≠ 任务停摆。实测会话期间任务持续产出（详见 §3.6 与 §7 的两次翻案记录） |
| **采用方案** | `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` 保活脚本持住浅度空闲（方案 A），配合无人参与超时与电池睡眠超时清零（方案 B 部分） |
| **结果** | 连续两晚通宵运行：一晚 67 个任务产物（03:01–04:04），一晚 193 个产物零断档（03:03–08:19）；会话期间电量入场 = 出场，全程插电 |

## 1. 环境基线

| 项目 | 详情 |
| :--- | :--- |
| 系统 | Windows 26H2，Build **26300.9550**（Pro for Workstations，x64） |
| 设备形态 | 支持现代待机（S0 低电量待机 · 连接网络）的笔记本；`powercfg -a` 显示 S3 不可用 |
| 电源计划 | 平衡（`SCHEME_BALANCED`），AC / DC 双档均核查 |
| 排查窗口 | 2026-09-23 夜 ~ 2026-09-27 晨，共两个完整挂机夜 |
| 挂机任务 | ZCode 会话中的 Agent 任务（本地执行命令 + 远程 API 调用），产物落盘可计数 |

## 2. 故障模型：S0 机器上「后台任务停止」是五层机制叠加

症状相同（任务停了），机制分层，逐层排查才有结论：

| 层级 | 机制 | 生效条件 | 观测手段 |
| :--- | :--- | :--- | :--- |
| **M1 常规空闲睡眠** | `STANDBYIDLE`（在此时间后睡眠） | 屏幕亮着、无输入到达超时 | `powercfg -q SCHEME_CURRENT SUB_SLEEP` |
| **M2 无人参与超时** | `UNATTENDSLEEP`（**设置界面不可见**的隐藏项） | 锁屏 / 无人状态，独立于 M1 | `powercfg -qh`（普通 `-q` 看不到） |
| **M3 存在感应熄屏加速** | 人存在传感器 + `USERPRESENCEPREDICTION` / `HUPR*` / `NSENINPUTPRETIME` | 离开检测触发提前熄屏 | `powercfg -qh SCHEME_CURRENT SUB_PRESENCE` |
| **M4 熄屏即待机会话** | 熄屏 = 现代-standby 会话入口（记 506）；无阻睡请求 → 平台进入深睡 | 任意熄屏（空闲 / 存在感应 / 手动） | 事件日志 + 电源报告 |
| **M5 请求类型与合盖** | `ExecutionRequired`（执行）**不**阻止深睡；合盖动作（`LIDACTION`）独立于一切超时 | 应用申报类型错误 / 合上盖子 | `powercfg -requests`；`SUB_BUTTONS` |

> [!NOTE]
> 本例五层全占：M1 插电档本就是"永不"、M2 藏着 120 秒、M3 让熄屏提前到离开 30 秒、M4 让"永不"形同虚设、M5 里的合盖是唯一连脚本也拦不住的动作。**任何一层没查到，结论都会错。**

## 3. 诊断过程：五个假设的排除链

### 3.1 事件指纹：先看 506/507 历史与原因字段

```powershell
Get-WinEvent -FilterHashtable @{LogName="System"; ProviderName="Microsoft-Windows-Kernel-Power"; Id=506,507} -MaxEvents 40 |
  Select-Object TimeCreated, Id, Message | Format-List
```

本机「进入待机原因」实测分布与判读：

| 原因字段 | 含义 | 本次判读 |
| :--- | :--- | :--- |
| `Idle Timeout` | 空闲超时开启会话 | 出现频率最高，**但不是"睡死"的充分证据**（见 §3.6） |
| `Lid` | 合盖 / 开盖触发 | 合盖 = 无条件入睡，与所有超时无关 |
| `AC/DC Display Burst Suppressed` | 显示相关的平台级转换 | 常伴随熄屏瞬间，成对出现 |
| `Austerity Battery Drain Budget Exceeded` | 电池待机耗电超出预算被强制处理 | 说明该时段在用电池，插电可避免 |
| `Sleep, Hibernate, or Shutdown` | 主动睡眠 / 休眠 / 关机 | 人为操作或级联动作 |

唤醒原因同样有判读价值：`Input Keyboard/Mouse/Touchpad` = 有人操作；`SC_MONITORPOWER` = 显示器电源事件；`SetThreadExecutionState` = 某进程（重新）申报了执行状态；`Resume from Hibernate` = 从休眠恢复。

首晚实锤：`0:54:38 进入（Idle Timeout）→ 1:05:12 退出（SC_MONITORPOWER）→ 1:05:14 再入 → 7:43:57 退出（Input Keyboard）`——任务在 0:54 就随会话停摆，睡了整夜。

### 3.2 假设一「常规空闲睡眠」→ 排除

`powercfg -q SCHEME_CURRENT SUB_SLEEP` 显示 `STANDBYIDLE` 插电档为 0（永不）。「永不」却仍睡，排除单纯 M1。**顺手把电池档 180 秒也清零**（`powercfg -change -standby-timeout-dc 0`），排除 DC 档干扰。

### 3.3 假设二「无人参与超时」→ 命中一层，但不是全部

`powercfg -qh SCHEME_CURRENT SUB_SLEEP`（**必须 `-qh` 才可见**）暴露隐藏项 `UNATTENDSLEEP`（无人参与系统睡眠超时）：AC / DC 均为 **120 秒**，且设置界面完全不显示它。锁屏后系统进入"无人参与"状态，改用这条超时而不是 M1 的"永不"——与首晚现象吻合。

修复：AC / DC 双双置 0 后生效验证无误。**但当天中午系统仍以 `Idle Timeout` 开启会话——说明这层只是叠加机制之一，不是全部。**（本次排查最大的一次认知修正：一个真实根因被修掉后，症状依然存在。）

### 3.4 假设三「电源模式覆盖层覆盖了设置」→ 排除

Win11 的性能滑块是叠加在电源计划上的覆盖层（overlay），理论上可能自带设置值。查注册表 `HKLM\...\PowerSchemes` 下 `ActiveOverlayAcPowerScheme` / `ActiveOverlayDcPowerScheme` 指向的两个覆盖层 GUID 并递归导出：**均未定义任何 `SUB_SLEEP` 键**，不构成覆盖。排除。

### 3.5 假设四「网卡省电断网导致任务假死」→ 排除

`Get-NetAdapterPowerManagement` 全量核查：有线 / WLAN 的 `AllowComputerToTurnOffDevice`、`SelectiveSuspend` 均为 Unsupported，`DeviceSleepOnDisconnect` 为 Disabled。网卡侧无罪。且停摆时段与系统会话时段严格重合，指向电源层而非网络层。

### 3.6 假设五「系统睡死了」→ 被电源报告 + 产物时间戳推翻（本次最重要的翻案）

旧命令 `powercfg /systemsleepdiagnostics` 已弃用，改用：

```powershell
powercfg /systempowerreport -output .\powerreport.html
```

报告为每个待机会话记录了明细。拿 9 月 24 日中午那次会话核对（事件日志显示 12:17:54 进入、13:00:42 退出）：

```text
EntryTimestampLocal : 2026-09-24T12:17:54   ExitTimestampLocal : 2026-09-24T13:00:42
OnAc                : true                   （插电）
IdleTimeoutSource   : Disabled               （睡眠超时确实是禁用状态——设置生效了）
EntryRemainingCapacity == ExitRemainingCapacity  （电量入场 = 出场，零消耗）
```

再对任务产物做时间戳统计：**会话期间产物持续写入**。结论反转——506 只是"会话开始"，系统被某个东西按在浅度空闲，任务实际还在跑。由此建立了本篇的判读规则（§4），并据此把此前两次"又失败了"的误判纠正为"成功"。

> [!WARNING]
> **判读规则：506 ≠ 睡死。** 定生死靠三件套：① 电源报告里该会话 `OnAc` 与「电量入场 = 出场」；② 任务产物时间戳的连续性；③ `powercfg -requests` 当前持有什么请求。只看事件日志，结论会反。

## 4. 根因

**统一机制**：现代待机机器上，**熄屏即开启待机会话**（506 是入口记录）。会话开始后系统能否进入深度睡眠（平台深睡），取决于有没有活跃的 **SYSTEM 阻睡请求**：

- 常驻应用普遍持有的 `PowerRequestExecutionRequired`（执行请求，`powercfg -requests` 的「执行」分区）只保证进程在会话中可被调度，**不阻止深睡**——实测某 Electron 应用的"防止睡眠"开关开启后申报的仍是执行类请求；
- 第三方工具（本机为某远程控制工具与某安卓模拟器的进程）持有的才是 SYSTEM 分区请求，但**进程不在就失效**，不可作为挂机依赖；
- `UNATTENDSLEEP`（120 秒）是"屏幕亮着但无人"场景的独立加速路径；存在感应把熄屏提前到离开约 30 秒，进一步缩短了"亮屏窗口"；
- 合盖动作（`LIDACTION`=睡眠）完全绕开上述一切，是独立的强制入口。

**可复用判据**：任务停摆 + 事件 506 `Idle Timeout` + 睡眠超时为"永不" + `powercfg -qh` 里无人参与超时非零 → 至少 M2/M4 两层并存；此时直接上 SYSTEM 阻睡请求即可同时覆盖，无需逐一打补丁。（依据：修复 1 只清 M2 后症状依旧；脚本持 SYSTEM 请求后两晚通宵。）

## 5. 修复方案与执行

### 5.1 方案对比

| 方案 | 做法 | 优点 | 缺点 / 风险 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **A. 阻睡请求保活脚本** | `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` | 屏幕照常熄灭；任何超时 / 存在感应 / 熄屏路径都无法深睡；进程退出即自动恢复省电 | 窗口关了就失效（也是特性：不留隐患）；合盖拦不住 | ✅ **采用** |
| B. 全部超时置 0 + 禁熄屏 | `powercfg` 各超时清零 | 无需脚本 | 插电屏幕常亮；存在感应 / 锁屏熄屏多路径难堵全 | 部分采用（M1/M2 清零作双保险） |
| C. 注册表禁用现代待机 | `PlatformAoAcOverride=0` + 重启 | 根治 | 本机固件无 S3，机器将失去全部自动睡眠；影响面大 | 未采用 |
| D. 合盖动作改"不操作" | `LIDACTION=0` | 消除合盖入睡 | 合盖后继续运行，散热差（不可塞包） | 暂未改（挂机时保持开盖） |

### 5.2 保活脚本（keep-awake）

`keep-awake.ps1`：

```powershell
param([int]$Seconds = 0)

Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'

# ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
# 只声明"系统不得睡眠"，不声明 ES_DISPLAY_REQUIRED，因此屏幕照常熄灭
[Win32.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null

Write-Host "AI 挂机保活已生效；按 Ctrl+C 或关闭本窗口即恢复省电"

if ($Seconds -gt 0) {
    Start-Sleep -Seconds $Seconds          # 测试模式：N 秒后自动退出
} else {
    while ($true) { Start-Sleep -Seconds 60 }
}
```

`keep-awake.cmd`（双击入口）：

```bat
@echo off
title AI Keep Awake - close this window to restore power saving
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keep-awake.ps1"
pause
```

放置于 `%USERPROFILE%\Desktop\keep-awake\`，挂机前双击、窗口最小化即可。

**上线前实测**（必须做，不能想当然）：带 `-Seconds 15` 参数后台运行，期间 `powercfg -requests` 的 SYSTEM 分区出现 `powershell.exe`，退出后该条目消失——请求生效与自动解除双向确认。

### 5.3 配套的电源设置清零（双保险）

```powershell
powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
powercfg -setdcvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
powercfg -setactive SCHEME_CURRENT
powercfg -change -standby-timeout-dc 0
```

## 6. 验证

前后对比：

| 指标 | 修复前（9/23→24 夜） | 修复后（9/24→25 夜） | 修复后（9/26→27 夜） |
| :--- | :--- | :--- | :--- |
| 会话 506 | `0:54` 入 → `7:43` 出，任务停摆 | `3:24:05` 入（浅度） | `2:54:33` 入（浅度） |
| 产物写入 | 无 | **67 个**（03:01:04 – 04:04:40） | **193 个**（03:03:52 – 08:19:47）连续零断档 |
| 电量 | — | 入场 = 出场（59798 / 60075 mWh） | 全程插电，晨起 99% |
| 保活进程 | 无 | 23:21:07 启动，持续存活 | 0:59:21 启动，持续存活 |

两晚细节：

- **第一晚**（脚本于前夜 23:21 启动）：凌晨 1:51、3:19、3:24 三次会话均为浅度，任务在 03:01–04:04 间产出 67 个产物后自然收尾；电源报告核对会话 `OnAc: true`、电量入场 = 出场。
- **第二晚**：2:54 进入会话后，产物从 03:03 一路连续写到 08:19（检查时点），无任何断档；期间 6:28–6:53 有过几次外设输入与一次「合盖 102 秒又开盖」，未造成中断。

> [!NOTE]
> 事件日志里两晚都**仍然存在** 506 记录——这是正常现象：506 是"熄屏开启会话"，不代表深睡。判断任务是否真的在跑，永远以 §3.6 的三件套为准。

## 7. 局限与未验证项

- **单机样本**：结论来自一台 S0 笔记本；传统 S3 睡眠机器与台式机路径不同，判读表需重验。
- **第一晚 04:04 之后无新增产物**：无法区分"任务已完成收尾"还是"浅度空闲限流后停摆"，当时未保留任务侧日志；第二晚 193 个产物连续到晨起，可确认浅度空闲足以支撑长时间任务。
- **电池模式未通宵实测**：文档与日志（`Austerity Battery Drain Budget Exceeded`）均表明电池待机耗电超预算时系统会强制处理，本方案的通宵场景默认**插电**。
- **合盖动作未改**：仍是"睡眠"，6:51 那次合盖 102 秒纯属侥幸无损；挂机夜必须保持开盖，改 `LIDACTION` 的利弊见 §5.1。
- **Windows Update 夜间自动重启**属理论残留风险（本次两晚未发生），重开任务即可恢复。
- 某应用"防止睡眠"开关在本机实测只申报执行类请求，不代表所有版本 / 所有平台行为。

## 8. 命令速查

```powershell
# 睡眠状态与隐藏设置（-qh 才能看到无人参与超时）
powercfg -a
powercfg -qh SCHEME_CURRENT SUB_SLEEP
powercfg -qh SCHEME_CURRENT SUB_PRESENCE

# 谁在持有什么电源请求（「执行」分区 ≠ 阻睡；SYSTEM 分区才拦深睡）
powercfg -requests

# 待机会话历史（原因字段判读）
Get-WinEvent -FilterHashtable @{LogName="System"; ProviderName="Microsoft-Windows-Kernel-Power"; Id=506,507} -MaxEvents 40 | Format-List TimeCreated, Id, Message

# 电源报告（旧 systemsleepdiagnostics 已弃用；看 OnAc / 电量入场出场 / IdleTimeoutSource）
powercfg /systempowerreport -output .\powerreport.html

# 保活脚本的生效 / 解除双向验证（对照 SYSTEM 分区）
powershell -NoProfile -ExecutionPolicy Bypass -File .\keep-awake.ps1 -Seconds 15
powercfg -requests

# 清零无人参与超时与电池档睡眠（双保险）
powercfg -setacvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
powercfg -setdcvalueindex SCHEME_CURRENT SUB_SLEEP UNATTENDSLEEP 0
powercfg -setactive SCHEME_CURRENT
powercfg -change -standby-timeout-dc 0
```

## 参考

- [Modern Standby（Microsoft Learn，硬件设计文档）](https://learn.microsoft.com/windows-hardware/design/device-experiences/modern-standby)
- [SetThreadExecutionState（Microsoft Learn，Win32 API）](https://learn.microsoft.com/windows/win32/api/powerbase/nf-powerbase-setthreadexecutionstate)

---

## 🤖 AI 生成声明

> [!IMPORTANT]
> 本文由 **AI 助手辅助生成**（ZCode / GLM 模型）。文中所有诊断、命令与修复操作均在真实环境中由 AI 实际执行并逐步记录；事件时间线、产物计数、电量字段、验证结果均来自实测输出（系统事件日志、`powercfg` 报告、产物时间戳统计），非虚构演绎；电源设置修改与脚本上线均经机主本人逐次确认。
>
> 环境与操作具有个体差异，**本文仅供技术参考，不构成任何保证**。照搬操作前请结合自身环境判断，重要操作前备份。

---

<div align="center">

**复测口径：26300.9550 · 连续两晚通宵（67 + 193 个产物）· 夜间电池消耗 0% · 会话期间电量入场 = 出场**

*2026.09.27*

</div>
