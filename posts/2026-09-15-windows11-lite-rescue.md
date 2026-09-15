<div align="center">

# 精简版 Windows 11 更新链路瘫痪（`0x80073712`，4114 处组件损坏）：诊断与 UUP 就地修复升级

**故障与方案摘要：第三方"轻度精简"镜像出厂即锁死 Windows 更新（服务禁用 + 组策略 + 设置页隐藏），叠加组件存储损坏 4114 处、CBS 日志关闭、WinRE 被删除。DISM/SFC/云重置/官方 ISO 四条标准修复路径全部因结构性原因失效；最终以 UUP 官方文件流现场拼制版本号高于本机的完整镜像，就地修复升级到 26H2 (26300.9539)，文件/应用/设置 100% 保留、组件损坏清零。**

[![版本](https://img.shields.io/badge/Windows%2011-26200.8973%20%E2%86%92%2026300.9539-0078D4?logo=windows11)](https://www.microsoft.com/windows)
[![组件存储](https://img.shields.io/badge/ScanHealth-4114%20%E2%86%92%200-brightgreen)](#6-验证)
[![数据保留](https://img.shields.io/badge/%E6%96%87%E4%BB%B6%2F%E5%BA%94%E7%94%A8%2F%E8%AE%BE%E7%BD%AE-100%25%20%E4%BF%9D%E7%95%99-success)](#6-验证)
[![修复方式](https://img.shields.io/badge/%E6%96%B9%E6%A1%88-UUP%20In--Place%20Upgrade-orange)](#5-修复方案与执行)

</div>

---

## 0. 摘要

| 项 | 内容 |
| :--- | :--- |
| **首要症状** | 设置页 Windows 更新报错打不开（服务禁用 + 组策略 + `SettingsPageVisibility` 三重封锁） |
| **解除封锁后** | 能检测到 KB5124008 (26200.9445)，但安装固定失败 `0x80073712`（`ERROR_SXS_COMPONENT_STORE_CORRUPT`） |
| **根因** | 病源镜像（第三方"轻度精简"版）出厂破坏：组件存储损坏 4114 处、`EnableLog=0`（CBS 日志被关）、`winre.wim` 删除；官方页面标注"关闭系统更新"属其卖点而非缺陷 |
| **失效路径** | DISM `/RestoreHealth` 卡死 66.4%、本地源 `0x800f0915`、`sfc /scannow` 无法启动、云重置无 WinRE、官方 ISO 基线低于本机 UBR 被 setup 拒绝 |
| **采用方案** | UUP dump 拼制 26H2 (26300.9539) 完整镜像 → `setup.exe /auto upgrade` 就地修复升级 |
| **结果** | 组件损坏 4114 → 0；更新链路全通；版本 26200.8973 → 26300.9539；WinRE `Enabled`；文件/应用/设置 100% 保留 |
| **约束** | 不接受重装，数据必须全保留（机主硬性要求，已达成） |

## 1. 环境基线

| 项目 | 详情 |
| :--- | :--- |
| 设备 | 荣耀 MagicBook（x64 / 32GB） |
| 硬盘 | ZHITAI TiPlus7100 2TB NVMe（健康） |
| 系统安装日期 | 2026-09-06 22:10（由 Windows.old 旧注册表 `InstallDate`、旧用户配置文件夹创建时间、D 盘建目录时间三方互证） |
| 病源系统 | 「Windows 11 Pro 26200.8973 2in1 轻度精简版」1.93GB ESD，2026-07-30 封装<br>出处：[423down #16518](https://www.423down.com/16518.html)；ESD 存档：`D:\<本地镜像库>\OS\iso\Windows\` |
| 修复后系统 | Windows 11 Pro 26H2 (**26300.9539**) 官方完整镜像 |
| 关键工具 | UUP dump / aria2c / DISM / COM `IUpdateSession2` / `convert-UUP.cmd` |

## 2. 故障模型：精简镜像破坏的四层结构

症状相同（更新报错），根因分层，必须逐层排查——这是本次排查的核心框架：

| 层级 | 破坏内容 | 观测手段 | 典型症状 |
| :--- | :--- | :--- | :--- |
| **L1 封锁层** | 策略锁 / 服务禁用 / 设置页隐藏 | `sc query`、`reg query ...\WindowsUpdate`、`SettingsPageVisibility` | 设置页打不开更新 |
| **L2 缓存层** | `SoftwareDistribution` 损坏 | `robocopy /MIR` 清空后重试 | 下载失败、`0x8024xxxx` |
| **L3 服务栈层** | CBS / 组件存储损坏 | `Dism /Online /Cleanup-Image /ScanHealth` | **`0x80073712`** |
| **L4 诊断层** | CBS 日志关闭、WinRE 删除 | `EnableLog` 键值、`reagentc /info` | 无法定位原因、无恢复后路 |

本次故障四层全中，因此按 L1 → L2 → L3 → L4 顺序推进。

## 3. 诊断过程

### 3.1 L1：解除三重封锁

```powershell
# ① 更新协调服务被禁用 → 恢复自动启动
Set-Service UsoSvc -StartupType Automatic; Start-Service UsoSvc

# ② 组策略 NoAutoUpdate=1 → 删除整个 AU 策略键
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /f

# ③ SettingsPageVisibility 把 windowsupdate 页隐藏 → 从 hide: 列表摘除
#    位置：HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer

# ④ 系统代理指向死代理 127.0.0.1:80（第三方加速工具残留）→ 关闭
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0
```

重启后更新页面恢复，成功检测到待装更新 **KB5124008 (26200.9445)**；点击安装固定报 **`0x80073712`**。

> [!WARNING]
> **根因线索（事后核对镜像打包页确认）**：[镜像出处页面](https://www.423down.com/16518.html)自述卖点即 **"关闭系统更新"**——前述三重封锁是镜像的出厂设计，而非系统 bug。页面宣称"保留 Hyper-V"等组件，实机核查 `vmcompute` 已被删除、组件存储损坏 4114 处。**宣传组件清单与实际交付内容不一致**，是本例真正的病灶。

### 3.2 L2：清理下载缓存并重试

```powershell
# Download 目录 20 万个文件 / 5.3GB，常规删除被超长路径卡死
robocopy C:\EmptyDir C:\Windows\SoftwareDistribution\Download /MIR   # 镜像空目录法，规避 MAX_PATH
```

```text
COM IUpdateSession2 重试：下载 8.4GB 全部成功（含完整组件修复链 KB5043080.wim 等）
安装结果：仍然 0x80073712
```

**判读**：下载通道与缓存均正常，故障位于组件对账层（L3）——排除网络与缓存假设。

### 3.3 L4：先开诊断日志（本次关键转折）

所有失败都无法定位，原因在于诊断层被关闭：

```powershell
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing'
# EnableLog            = 0    ← CBS 日志被硬关闭
# DisableRemovePayload = 1
# DisableWerReporting  = 1

# 打开日志开关
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableLog -Value 1 -Type DWord
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableDpxLog -Value 1 -Type DWord
```

开启后 1 分钟内 `C:\Windows\Logs\CBS\CBS.log` 写入 1.4MB。日志与注册表给出两条定量结论：

```powershell
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\LCUInstallErrorPackageNames"
# → 基线包 26100.1742 累计失败 9 次；它是后续所有累积更新的对账基底

Dism /Online /Cleanup-Image /ScanHealth
# → 检测到组件存储损坏 4114 处，集中在精简工具惯常删除的类别：
#   迁移组件、OOBE、遥测、appx 资源
```

> [!IMPORTANT]
> **判据闭环**：基线包累败 + 4114 处损坏，说明"手工定点修复"与"在线修复源修复"都不具备可行性；"整镜像换底"由猜测变为有数字支撑的结论。

### 3.4 标准修复手段失败矩阵

对七条常规路径逐一实测并记录排除的假设：

| # | 手段 | 实测结果 | 排除的假设 |
| :--- | :--- | :--- | :--- |
| 1 | 清理 `SoftwareDistribution\Download` | 成功（robocopy 镜像法） | 缓存损坏 |
| 2 | COM `IUpdateSession2` 重新下载 | 8.4GB 下载全成功，安装仍 `0x80073712` | 下载链路 |
| 3 | `Dism /Online /Cleanup-Image /RestoreHealth`（在线源） | **卡死 66.4%**，磁盘零活动，持续 22 分钟 | 在线修复源可用性 |
| 4 | `Dism /RestoreHealth /Source:<Download目录> /LimitAccess` | `0x800f0915`（增量碎片非合法修复源） | 本地修复源可用性 |
| 5 | `sfc /scannow` | 无法启动 | 文件级修复可行性 |
| 6 | 云重置（设置 → 恢复） | `winre.wim` 已删除、WinRE Disabled | 重置后路 |
| 7 | 官方零售 ISO 就地升级 | 基线 26200.8037 < 本机 26200.8973 → setup 拒绝降级 | 常规升级路径 |

**判读规则（可复用）**：

- `RestoreHealth` 长时间停滞在同一百分比（>20 分钟、磁盘零活动、`CBS.log` 不再增长）→ 在线修复源通道不可用；
- 本地源报 `0x800f0915` → 手头 cab/msu 是增量碎片，不是合法修复源；
- `sfc` 报 "source file in store is also corrupted" → 源组件库自身损坏；
- 三者同时出现 = 确认 L3 深度损坏，直接进入镜像级修复，不再浪费下载与时间。

## 4. 修复方案选型

### 4.1 约束条件

- **setup 拒绝降级**：官方 ISO 基线必须 ≥ 本机 UBR（本机 26200.8973，当时官方零售 ISO 基线 26200.8037）；
- 数据零丢失（机主硬性要求）；
- 修复过程不得依赖已损坏的 CBS 组件存储。

### 4.2 候选方案对比

| 方案 | 是否满足约束 | 结论 |
| :--- | :--- | :--- |
| 直装 MSU 更新包 | 走同一 CBS 层 | ❌ 结构性失败 |
| 云重置 | 需 WinRE，本例已删除 | ❌ 不可用 |
| 官方零售 ISO 就地升级 | 基线低于本机 UBR | ❌ 被 setup 拒绝 |
| **UUP 定制镜像就地升级** | 版本可 ≥ 本机、独立于 CBS、失败自动回滚 | ✅ 采用 |

**就地升级的结构性优势**：`setup.exe` 独立运行、不依赖已损坏的 CBS，数据与应用保留，失败可自动回滚——前提是提供一份版本足够新的官方完整镜像。

## 5. 修复方案与执行

### 5.1 选构建

```text
候选：26H2 build 26300.9539（当时处于 Release Preview 通道，为最新可用构建）
核对：https://api.uupdump.net/listid.php?search=<目标build>
      selectlang.php?id=<uuid> 页面确认通道标注（Retail / Release Preview）
要求：版本号 ≥ 本机 UBR（否则 setup 拒绝）
```

> [!NOTE]
> **决策记录**：26H2 当时尚未 GA。向机主说明 Release Preview 与 Retail 的差异与风险后，机主拍板直接升级，GA 后自动转正。

### 5.2 获取镜像

```powershell
# ① 生成下载脚本包
curl -L "https://uupdump.net/get.php?id=<uuid>&pack=zh-cn&edition=professional&autodl=2" -o pkg.zip

# ② uupdump 后端当晚故障约一小时 → 探测循环：每 5 分钟请求清单接口，直到返回微软 CDN 真实直链
# ③ 清单到手后立即脱离 uupdump，直连微软 CDN 下载（16 连接，9.4GB 用时约 5 分钟）
.\files\aria2c.exe -x16 -s16 -j5 -c -d UUPs -i probe26300.txt

# ④ 本地离线转换打包（与后端无关）
convert-UUP.cmd   # 集成 9 个更新包 → 压缩导出 → 生成 ISO（10.3GB，含 winre.wim）
```

**两个已记录的弯路**：

- 微软官方开源的 **UUPMediaCreator 发布包缺少全部应用 DLL**（打包事故），NuGet 亦无对应产物 → 官方工具路线放弃；
- `uupdump` 后端不可靠（清单生成依赖它），而**微软 CDN 侧稳定**：拿到 aria2 清单后立即脱离后端，是本次稳定通过的关键。

### 5.3 无人值守就地升级

```powershell
# 升级前检查：接通 AC 电源；禁用睡眠/休眠，防止无人值守中断
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# 挂载 ISO 并启动无人值守修复升级
Mount-DiskImage -ImagePath <iso> -PassThru
E:\setup.exe /auto upgrade /quiet /eula accept
```

### 5.4 升级后收尾（两处必查）

> [!WARNING]
> **坑一：UAC 过滤令牌被重置**。升级将 `FilterAdministratorToken` 重置为 1，内置管理员失去提升权限，UAC 弹窗重新出现：
> ```powershell
> Set-ItemProperty 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name FilterAdministratorToken -Value 0 -Type DWord
> ```
>
> **坑二：陈旧 pending session 阻塞 CBS**。修复阶段被强杀的 DISM 在注册表残留 `SessionsPending` 登记，升级后首次 `ScanHealth` 直接挂死（会话初始化后零 CPU）。**解法：重启一次**——CBS 开机自动清算 pending session，无需手工清理。

其余收尾项：Defender 服务存在但停止 → 恢复启动类型并启动；`$WINDOWS.~BT` 由系统自动清理；UUP 工作目录（约 20GB）观察稳定后手动删除（系统自动清理可能同时删除 ISO 与源文件）。

## 6. 验证

| 指标 | 修复前 | 修复后 |
| :--- | :--- | :--- |
| `Dism /ScanHealth` 组件损坏数 | **4114** | **0**（未检测到损坏） |
| Windows 更新 | 页面报错 + 安装失败 ×10 | 扫描 / 下载 / 安装全链路通过 |
| 系统版本 | 26200.8973（精简残破） | 26300.9539（26H2 官方完整） |
| WinRE 恢复环境 | 已删除 | **Enabled**（独立恢复分区） |
| CBS 日志 | `EnableLog=0` | 开启，历史错误记录清零 |
| 文件 / 应用 / 设置 | — | **100% 保留** |
| 待装安全更新 | KB5007651 / KB5124008 反复失败 | KB5007651 一次通过（`0x00000000`） |

## 7. 局限与未验证项

- 26H2 升级时处于 **Release Preview** 通道，非 GA 版本；GA 后自动转正未经本次验证；
- 结论基于单台设备、单一镜像来源（423down #16518）实测，未在其他精简镜像上复现该四层破坏组合；
- 升级后仅验证了组件存储健康度与新版本可用性，长期稳定性未跟踪；
- `uupdump` 后端故障为当晚观测，不代表其常态可用性。

## 8. 附录：命令速查（可照抄）

### A.1 诊断顺序

```bat
:: L1: 服务与策略锁
sc query UsoSvc & sc query wuauserv & sc query bits & sc query DoSvc
reg query "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" /s
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v SettingsPageVisibility

:: 代理（死代理会让更新检查全挂）
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v ProxyEnable
netsh winhttp show proxy

:: L3: 组件健康（0x80073712 的判定）
Dism /Online /Cleanup-Image /ScanHealth

:: L4: CBS 日志是否可用（精简系统常见被关）
dir C:\Windows\Logs\CBS
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing" /v EnableLog

:: 历史失败记录（定位具体失败包）
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\LCUInstallErrorPackageNames"

:: 恢复环境
reagentc /info
dir C:\Windows\System32\Recovery\winre.wim
```

**先开日志再诊断**：若 `EnableLog=0`，先按 3.3 两行注册表改回 1，再执行任何修复动作。

### A.2 修复阶梯（从轻到重，每层验证后再升级手段）

```powershell
# 阶段 0：解除 L1 封锁
Set-Service UsoSvc -StartupType Automatic; Start-Service UsoSvc
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /f
# SettingsPageVisibility：从 hide: 列表摘除 windowsupdate
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0
```

```bat
:: 阶段 1：清下载缓存
net stop wuauserv & net stop bits
robocopy C:\EmptyDir C:\Windows\SoftwareDistribution\Download /MIR
net start wuauserv & net start bits

:: 阶段 2：组件修复尝试（大概率失败，但必须排除）
Dism /Online /Cleanup-Image /RestoreHealth                              :: 在线源
Dism /Online /Cleanup-Image /RestoreHealth /Source:C:\路径 /LimitAccess  :: 本地源
sfc /scannow
```

阶段 2 判读见 3.4；三者皆现即确认 L3 深度损坏，进入阶段 4。

```text
阶段 3：确认剩余出路
  云重置（设置→恢复）: reagentc /info + winre.wim 存在 → 否则死路
  官方 ISO 就地升级  : 官方 ISO 基线 ≥ 当前 UBR → 否则 setup 拒绝降级
  直装 MSU           : 走同一 CBS 层 → 结构性失败，不浪费下载
```

```powershell
# 阶段 4：UUP 定制镜像 + 就地修复升级
#  1) 选构建：listid.php?search=<目标build>，必须 ≥ 当前 UBR；selectlang.php?id=<uuid> 核对通道
#  2) 生成脚本包：get.php?id=<uuid>&pack=zh-cn&edition=professional&autodl=2
#  3) 后端故障对策：探测循环盯清单接口，清单到手立即脱离 uupdump
#     aria2c -x16 -s16 -j5 -c -d UUPs -i <清单>；convert-UUP.cmd 纯本地转换
Mount-DiskImage -ImagePath <iso> -PassThru
X:\setup.exe /auto upgrade /quiet /eula accept
powercfg /change standby-timeout-ac 0     # 无人值守前置

#  5) 升级后必查：版本号 + ScanHealth（期望"未检测到组件存储损坏"）
Dism /Online /Cleanup-Image /ScanHealth
```

### A.3 常见坑

1. **Git Bash 调 PowerShell**：双引号内 `$` 被 bash 吞掉——复杂命令写 `.ps1` 并用 `-File` 执行；`/参数` 会被转成路径——用 `cmd //c "..."` 包裹。
2. **PowerShell 5.1 读 UTF-8 无 BOM 的 `.ps1`**：中文字符串乱码并破坏语法——自动化脚本写纯 ASCII。
3. **重命名 `SoftwareDistribution` 被拒绝**：改用 robocopy 镜像法清空 `Download` 子目录。
4. **DISM 强杀后**：必须重启清算 `SessionsPending`，否则后续所有 CBS 操作挂死。
5. **精简系统缺 `winre.wim`**：云重置不可用；UUP 定制镜像自带 `winre.wim`，升级后自动恢复。
6. **升级会重置 UAC 过滤令牌**：`FilterAdministratorToken` 变 1 导致内置管理员失去提升权限，恢复为 0。

## 9. 参考

- [423down #16518](https://www.423down.com/16518.html) —— 病源镜像出处（"关闭系统更新"为其卖点）
- [UUP dump](https://uupdump.net) —— 基于微软官方 UUP 服务器定制 Windows 镜像的社区方案
- [Windows Release Health](https://learn.microsoft.com/en-us/windows/release-health/) —— 微软官方版本发布状态（用于确认 26H2 通道与版本线）
- [Fido by pbatard](https://github.com/pbatard/Fido) —— 微软官方 ISO 直链获取脚本
- [0x80073712 官方文档](https://learn.microsoft.com/troubleshoot/windows-client/installing-updates-features-roles/error-0x80073712-when-installing-updates) —— `ERROR_SXS_COMPONENT_STORE_CORRUPT`

---

## 🤖 AI 生成声明

> [!IMPORTANT]
> 本文由 **AI 助手辅助生成**（ZCode / GLM 模型）。文中所有诊断、命令与修复操作均在真实环境中由 AI 实际执行并逐步记录，数据（错误码、组件损坏计数、时间线、验证结果）均来自实测输出，非虚构演绎；关键决策（如升级到 26H2、数据保留方式）经机主本人确认。
>
> 环境与操作具有个体差异，**本文仅供技术参考，不构成任何保证**。照搬操作前请结合自身环境判断，重要操作前备份。

---

<div align="center">

**复测口径：26300.9539 · ScanHealth 零损坏 · 更新链路全通 · WinRE Enabled**

*2026.09.15*

</div>
