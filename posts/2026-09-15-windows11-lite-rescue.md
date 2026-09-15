<div align="center">

# 🪟 Windows 折腾报告：精简版系统的"绝症"治愈实录

**一句话描述：从"设置页都打不开"到 4114 个组件损坏清零 —— 一台被精简工具玩坏的笔记本，如何在拒收一切修复手段后，靠 UUP 定制镜像完成绝地重生**

[![Windows](https://img.shields.io/badge/Windows%2011-25H2%20%E2%86%92%2026H2-0078D4?logo=windows11)](https://www.microsoft.com/windows)
[![组件存储](https://img.shields.io/badge/组件损坏-4114%20%E2%86%92%200-brightgreen)](#-效果验证)
[![数据保留](https://img.shields.io/badge/文件/应用/设置-100%25%E4%BF%9D%E7%95%99-success)](#-效果验证)
[![修复方式](https://img.shields.io/badge/方案-UUP%E5%AE%9A%E5%88%B6%E9%95%9C%E5%83%8F%20In--Place%20Upgrade-orange)](#%EF%B8%8F-折腾记录)

</div>

---

## 📋 概述

> 接手一台荣耀 MagicBook：**Windows 更新页面直接报错打不开**。本以为是一次普通的解锁操作，结果拆开一看是个无底洞——
>
> 精简工具不仅锁死了更新（服务禁用 + 组策略 + 页面隐藏三重封锁），还顺手干掉了 **4114 个组件**、关掉了 CBS 日志、删了 WinRE 恢复环境。
>
> 更绝的是：DISM 卡死、sfc 起不来、云重置没条件、官方 ISO 被版本号拒之门外——**所有教科书式修复手段全部失效**。
>
> 最终方案：**用 UUP 官方文件流现场拼制一份比本机更新的完整镜像，就地修复升级**。文件、应用、设置 100% 保留，组件存储损坏清零，Windows 更新恢复出厂级健康，系统一步登上 26H2——安全性、性能与最新功能全部到位。

## 🖥️ 环境基线

| 项目 | 详情 |
| :--- | :--- |
| **设备型号** | 荣耀 MagicBook（Honor） |
| **CPU / 内存** | x64 / 32GB |
| **硬盘** | ZHITAI TiPlus7100 2TB NVMe（健康） |
| **原装日期** | **2026-09-06 22:10**（考据自 Windows.old 旧注册表 InstallDate，与旧用户配置文件夹创建时间、D 盘建目录时间三方互证） |
| **病源系统** | 「Windows 11 Pro 26200.8973 2in1 轻度精简版 260730 小修」（1.93GB ESD，2026-07-30 封装）<br>出处：[423down #16518](https://www.423down.com/16518.html) · ESD 存档：`D:\<本地镜像库>\OS\iso\Windows\` |
| **修复后系统** | Windows 11 Pro **26H2 (26300.9539)** 官方完整镜像 |
| **关键工具** | UUP dump / aria2 / DISM / COM IUpdateSession2 |

## 🎯 折腾目标

- [x] 目标一：**恢复 Windows 更新**——安全补丁是系统的命脉，这是一切的起点
- [x] 目标二：**升级到 26H2**——获得安全性与性能提升，用上 Windows 的最新功能

> **底线约束**：文件、应用、设置 100% 保留（拒绝重装）——已达成
> **过程附加成果**（技术侧副产品，非主观目标）：组件存储 4114 处损坏清零、被删的 WinRE 恢复环境回归

## 🛠️ 折腾记录

### 阶段一：解锁三重封锁 —— "门打开了，屋里全是坏的"

**操作目的**：让设置页的 Windows 更新先能打开。

**具体操作**：

```powershell
# ① 更新协调服务被禁用 → 恢复自动启动
Set-Service UsoSvc -StartupType Automatic; Start-Service UsoSvc

# ② 组策略锁 NoAutoUpdate=1 → 整个 AU 策略键删除
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /f

# ③ SettingsPageVisibility 策略把 windowsupdate 页藏了 → 从 hide: 列表摘除
# 位置：HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer

# ④ 意外收获：系统代理指向死代理 127.0.0.1:80（302 加速工具残留）→ 关闭
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0
```

结果与截图：

> [!NOTE]
> 重启后更新页面正常打开，成功检测到待装更新 **KB5124008 (26200.9445)**——看起来已经赢了。

遇到的问题与解决：

> [!WARNING]
> **问题**：点击安装，报错 `0x80073712`（SXS 组件存储损坏）。
> **含义**：门打开了，但屋里——组件存储（WinSxS）——已经烂了。战场从 L1 封锁层转入 L3 服务栈层。
>
> **事后翻打包页才发现的神剧情**：[镜像出处页面](https://www.423down.com/16518.html)自己明写着**"关闭系统更新"**——上面解除的三重封锁根本不是隐藏 bug，而是这个镜像的**官方卖点**。而页面宣称"保留 Hyper-V"等一长串组件，实机上 vmcompute 被删、组件存储损坏 4114 处——**宣传与实物之间的差距**，才是这场绝症的真正病灶。

### 阶段二：教科书式修复大排查 —— "所有路都是死的"

**操作目的**：按从轻到重依次尝试标准修复手段，逐一排除。

**具体操作与结果**：

```powershell
# ① 清下载缓存：Download 目录 20 万个文件 / 5.3GB，普通删除被超长路径卡死
robocopy C:\EmptyDir C:\Windows\SoftwareDistribution\Download /MIR   # 镜像空目录法，超长路径免疫

# ② COM 重试：下载 8.4GB 全部成功（含完整组件修复链 KB5043080.wim 等），安装依旧 0x80073712
# ③ DISM /RestoreHealth（在线源）→ 卡死 66.4%，磁盘零活动，挂了 22 分钟
# ④ DISM /RestoreHealth /Source:<Download目录> /LimitAccess → 0x800f0915（增量碎片不是合法修复源）
# ⑤ sfc /scannow → 连启动都失败
# ⑥ 云重置 → 检查发现 winre.wim 被删、WinRE Disabled → 死路
# ⑦ 官方零售 ISO 就地升级 → 基线 26200.8037 < 本机 26200.8973 → setup 拒绝降级
```

> [!WARNING]
> **七个手段全军覆没，但每个失败都在收窄包围圈**：
> - 下载成功 + 安装失败 → 网络和缓存无罪，坏在对账的"账本"
> - DISM 卡死 + 本地源 0x800f0915 → 在线/离线修复源都救不了
> - 云重置死路 + 官方 ISO 拒降级 → 常规出路全被封死
>
> **结论**：需要一个"比本机 UBR 新"的完整健康镜像做就地修复升级。

### 阶段三：全局转折点 —— 发现诊断开关被关了

**操作目的**：为什么所有失败都无从定位？检查诊断层。

**具体操作**：

```powershell
# CBS 注册表里的精简指纹
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing'
# EnableLog = 0            ← CBS 日志被硬关！
# DisableRemovePayload = 1
# DisableWerReporting = 1

# 打开日志开关
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableLog -Value 1 -Type DWord
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableDpxLog -Value 1 -Type DWord
```

结果与截图：

> [!NOTE]
> 日志开关打开后 1 分钟，`C:\Windows\Logs\CBS\CBS.log` 就写了 1.4MB。**有了日志，真相开始自己说话**：
>
> 1. `LCUInstallErrorPackageNames` 键直接读出：基线包 `26100.1742` **累败 9 次**——它是后续所有累积更新的对账基底，解释了一切
> 2. `DISM /ScanHealth` 量化定位：**4114 个组件损坏**，且全是精简工具爱删的类别（迁移组件、OOBE、遥测、appx 资源）

遇到的问题与解决：

> [!WARNING]
> **问题**：4114 个损坏意味着什么？
> **结论**：手工定点修复不现实；在线修复源也修不动——"整镜像换底"从猜测变成有数字支撑的结论。**修复判据就此闭环。**

### 阶段四：UUP 定制镜像 —— 在后端罢工的日子里抢清单

**操作目的**：搞到一份"版本 ≥ 本机 UBR"的官方完整镜像。官方 ISO 全部太旧 → 只能走 UUP 现场拼装。

**具体操作**：

```powershell
# ① 选构建：必须 ≥ 本机 UBR（setup 拒绝降级！）
#    候选：26H2 26300.9539（Release Preview，最新）
#    用 selectlang.php?id=<uuid> 页面核对通道标注，向用户说明 RP vs Retail 利弊后锁定

# ② 生成下载脚本包（这一步依赖 uupdump 后端，而它当晚罢工了一个多小时）
curl -L "https://uupdump.net/get.php?id=<uuid>&pack=zh-cn&edition=professional&autodl=2" -o pkg.zip

# ③ 应对后端故障：探测循环——每 5 分钟探一次清单接口，直到返回微软 CDN 真实直链
# ④ 清单到手，立即脱离 uupdump，直连微软 CDN 下载（16 连接，9.4GB 仅 5 分钟）
.\files\aria2c.exe -x16 -s16 -j5 -c -d UUPs -i probe26300.txt

# ⑤ 本地转换打包（纯离线，与后端无关）
convert-UUP.cmd   # 集成 9 个更新包 → 压缩导出 → 生成 ISO（10.3GB，含 winre.wim）
```

> [!NOTE]
> **两个值得记录的弯路**：
> - 微软官方开源的 UUPMediaCreator，GitHub 发布包**缺全部应用 DLL**（打包事故），NuGet 上也没有——官方工具路线含恨放弃
> - 26H2 当时还未 GA（Release Preview 阶段），向用户说明利弊后用户拍板：直接上，GA 后自动转正

### 阶段五：无人值守修复安装 + 升级后收尾

**操作目的**：过夜自动完成就地升级，处理升级遗留。

**具体操作**：

```powershell
# 起飞前检查：电源 AC ✅、禁睡眠（防无人值守中断）
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

# 挂载 ISO 并启动无人值守修复升级
Mount-DiskImage -ImagePath <iso> -PassThru
E:\setup.exe /auto upgrade /quiet /eula accept
```

> [!WARNING]
> **升级后两个坑，都踩了**：
>
> **坑一：UAC 过滤令牌被重置**
> 升级把 `FilterAdministratorToken` 重置为 1，内置管理员突然失去提升权限，连 UAC 弹窗都开始出现。
> ```powershell
> Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name FilterAdministratorToken -Value 0 -Type DWord
> ```
>
> **坑二：陈旧 pending session 卡死新 CBS 会话**
> 修复过程中强杀过的 DISM 在注册表里留下 `SessionsPending` 陈旧登记，升级后第一次 ScanHealth 直接挂死（CBS session init 后零 CPU）。
> **解法：重启一次**——CBS 开机自动清算 pending session，无需任何手工手术。

## 📊 效果验证

| 指标 | 折腾前 | 折腾后 | 变化 |
| :--- | :--- | :--- | :--- |
| 组件存储损坏数 | **4114** | **0**（未检测到损坏） | ⬇️ 100% |
| Windows 更新 | 页面报错 + 安装失败 ×10 | 扫描/下载/安装全链路通过 | ♾️ |
| 系统版本 | 25H2 精简残破 (26200.8973) | 26H2 官方完整 (26300.9539) | ⬆️ 跨版本 |
| WinRE 恢复环境 | 已删除 | **Enabled**（独立恢复分区） | ♾️ |
| CBS 日志 | EnableLog=0 | 开启，历史错误记录清零 | ♾️ |
| 文件/应用/设置 | — | **100% 保留** | ✅ |
| 待装安全更新 | KB5007651/KB5124008 反复失败 | KB5007651 一次通过（0x00000000） | ✅ |

## 💡 心得与总结

1. **"轻度精简"也是绝症**。别被"轻度""小修"迷惑——本例删了 4114 个组件、关了诊断日志、删了恢复环境，每一刀都砍在更新管线的动脉上。精简镜像装机后**首次打累积更新前**，先花一分钟跑一遍 `Dism /ScanHealth`。
2. **修系统先开日志**。`EnableLog=0` 让前期所有失败都成了"无案发现场的命案"。一行注册表，让后续每个判断都有据可依——这是整场折腾的最大转折点。
3. **每个失败都在收窄包围圈**。下载成功+安装失败=排除网络缓存；DISM 卡死+本地源 0x800f0915=排除修复手段；云重置死路+ISO 拒降级=排除常规出路。当所有教科书手段都被证伪，剩下的就是正确答案。
4. **setup 的铁律：拒绝降级**。官方 ISO 基线落后于当前 UBR 时，就地升级直接被拒。解法是 UUP 定制镜像——它能把最新累积更新预集成进镜像，顺便完成一次版本跨越。
5. **uupdump 后端不可靠，但微软 CDN 极可靠**。清单生成（依赖第三方后端）会间歇罢工，文件本体（直连微软）又快又稳。拿到 aria2 清单后立刻脱离后端，是稳定通过的关键。
6. **就地升级是精简系统最后的、也是最优雅的救命稻草**：setup 独立运行不依赖已损坏的 CBS，失败自动回滚，数据全保留——条件只有一个：一份够新的官方镜像。

## 📚 参考与致谢

- [423down #16518](https://www.423down.com/16518.html) —— 病源镜像出处（"关闭系统更新"是它的卖点，本文的事故现场）
- [UUP dump](https://uupdump.net) —— 从微软官方 UUP 服务器定制 Windows 镜像的社区权威方案
- [Windows Release Health](https://learn.microsoft.com/en-us/windows/release-health/) —— 微软官方版本发布状态（本文用于确认 26H2 GA 状态与版本线）
- [Fido by pbatard](https://github.com/pbatard/Fido) —— 微软官方 ISO 直链获取脚本（Rufus 作者出品）
- [0x80073712 错误官方文档](https://learn.microsoft.com/troubleshoot/windows-client/installing-updates-features-roles/error-0x80073712-when-installing-updates) —— ERROR_SXS_COMPONENT_STORE_CORRUPT
- 感谢那位坚持"我要 26H2 直接上"的机主，以及那台在凌晨默默重启了 N 次的 MagicBook

---

## 📎 附录：完整技术手册（可照抄执行）

> 本附录是独立于叙事的"纯操作手册"，供遇到同类问题的读者按图索骥。

### A.1 精简破坏的四层模型

精简工具的破坏分四层，**症状相同（更新报错），根因不同**，必须逐层排查：

| 层级 | 破坏内容 | 典型症状 |
|---|---|---|
| L1 封锁层 | 策略锁/服务禁用/设置页隐藏 | 设置页打不开更新、报"出现错误" |
| L2 缓存层 | SoftwareDistribution 损坏 | 下载失败、0x8024xxxx 系列 |
| L3 服务栈层 | CBS/组件存储损坏 | **0x80073712**（SXS 组件存储损坏） |
| L4 诊断层 | CBS 日志被关、WinRE 被删 | 无法诊断、无恢复后路 |

### A.2 诊断命令速查（按此顺序排查）

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

:: 历史失败记录（定位具体是哪个包）
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\LCUInstallErrorPackageNames"

:: 恢复环境
reagentc /info
dir C:\Windows\System32\Recovery\winre.wim
```

**关键经验：先开日志再诊断。** 若 `EnableLog=0`，先改回 1：

```powershell
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableLog -Value 1 -Type DWord
Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing' -Name EnableDpxLog -Value 1 -Type DWord
```

没有 CBS 日志，DISM/sfc/安装失败都无从定位。

### A.3 修复阶梯（从轻到重，每层验证后再升级手段）

**阶段 0：解除 L1 封锁**

```powershell
Set-Service UsoSvc -StartupType Automatic; Start-Service UsoSvc
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /f
# SettingsPageVisibility：从 hide: 列表摘除 windowsupdate
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0
```

**阶段 1：清下载缓存**

```bat
net stop wuauserv & net stop bits
robocopy C:\EmptyDir C:\Windows\SoftwareDistribution\Download /MIR
net start wuauserv & net start bits
```

**阶段 2：组件修复尝试（大概率失败，但必须排除）**

```bat
Dism /Online /Cleanup-Image /RestoreHealth          :: 在线源
Dism /Online /Cleanup-Image /RestoreHealth /Source:C:\路径 /LimitAccess   :: 本地源
sfc /scannow
```

**判读**：
- RestoreHealth 卡死在同一百分比不动（>20 分钟、磁盘零活动、CBS.log 不再增长）→ 在线修复源通道已坏
- 本地源报 `0x800f0915` → 手头的 cab/msu 是增量碎片，不是合法修复源
- sfc 报 "source file in store is also corrupted" → 原件库自身损坏，无米之炊

**三者皆现 = 确认 L3 深度损坏，进入阶段 4。**

**阶段 3：确认剩余出路**

| 途径 | 检查点 | 失败表现 |
|---|---|---|
| 云重置（设置→恢复） | `reagentc /info` + winre.wim 存在 | WinRE 被删 → 死路 |
| 官方 ISO 就地升级 | 官方 ISO 基线 ≥ 当前 UBR | 基线更旧 → setup 拒绝降级 |
| 直装 MSU | 走同一 CBS 层 | 结构性失败，不浪费下载 |

**阶段 4：UUP 定制镜像 + 就地修复升级**

1. 选构建：`https://api.uupdump.net/listid.php?search=<目标build>`，**必须 ≥ 当前 UBR**；用 `selectlang.php?id=<uuid>` 核对通道（Retail=正式版，Release Preview=发布预览）
2. 生成脚本包：`https://uupdump.net/get.php?id=<uuid>&pack=zh-cn&edition=professional&autodl=2`，解压运行 `uup_download_windows.cmd`
3. 后端故障对策：探测循环盯 `get.php?...aria2=2`，清单到手立即脱离 uupdump，`aria2c -x16 -s16 -j5 -c -d UUPs -i <清单>` 直连微软 CDN；转换（convert-UUP.cmd）纯本地执行
4. 执行升级：
   ```powershell
   Mount-DiskImage -ImagePath <iso> -PassThru
   X:\setup.exe /auto upgrade /quiet /eula accept
   ```
   前置：接通电源；`powercfg /change standby-timeout-ac 0`。失败自动回滚。
5. 升级后必查：版本号 + `Dism /Online /Cleanup-Image /ScanHealth`（期望：未检测到组件存储损坏）

**阶段 5：升级后残留清理**

- `FilterAdministratorToken` 可能被重置为 1 → 恢复默认 0
- 强杀过 DISM 会留 `SessionsPending` 陈旧会话 → **重启一次**自动清算，否则 CBS 会话挂死
- Defender 服务存在但停止 → 恢复启动类型并启动
- 磁盘清理：`$WINDOWS.~BT` 系统自动清；UUP 工作目录（~20GB）稳定后手动删（**系统自动清理也可能直接删掉 ISO 与源文件**）

### A.4 常见坑

1. **Git Bash 调 PowerShell**：双引号内 `$` 会被 bash 吞掉——复杂命令写 .ps1 用 `-File` 执行；`/参数` 会被转成路径——用 `cmd //c "..."` 包裹。
2. **PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1**：中文字符串变乱码并破坏语法——自动化脚本写纯 ASCII。
3. **Rename SoftwareDistribution 被拒绝**：用 robocopy 镜像法清 Download 子目录即可。
4. **DISM 强杀后**：务必重启清算 `SessionsPending`，否则后续所有 CBS 操作挂死。
5. **精简系统没有 winre.wim**：云重置不可用；UUP 定制镜像自带 winre.wim，升级后自动恢复。
6. **升级会重置 UAC 过滤令牌**：`FilterAdministratorToken` 变 1 导致内置管理员失去提升权限——恢复 0 即可。

---

## 🤖 AI 生成声明

> [!IMPORTANT]
> 本文由 **AI 助手辅助生成**（ZCode / GLM 模型）。文中所有诊断、命令与修复操作均在真实环境中由 AI 实际执行并逐步记录，数据（错误码、组件损坏计数、时间线、验证结果）均来自实测输出，非虚构演绎；关键决策（如升级到 26H2、数据保留方式）经机主本人确认。
>
> 环境与操作具有个体差异，**本文仅供技术参考，不构成任何保证**。照搬操作前请结合自身环境判断，重要操作前备份。

---

<div align="center">

**本机现状：26H2 · 组件存储零损坏 · Windows 更新满血 · 最新功能已解锁**

*完——2026.09.15，于第 N 次重启之后*

</div>
