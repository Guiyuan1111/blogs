<div align="center">

# 🛡️ 杀毒软件的"幽灵之手"：卡巴斯基 TLS 中间人如何悄悄劫持了 Node 的网络请求

**一句话描述：AI 编程智能体的联网搜索间歇性报 `TypeError: fetch failed`——配置没动、网络通畅、密钥齐全，最终发现是卡巴斯基在中间人扫描时给 DeepSeek API 换了一张证书，而且换错了域名**

[![症状](https://img.shields.io/badge/%E7%97%87%E7%8A%B6-TypeError%3A%20fetch%20failed-red)](#-症状回放)
[![真凶](https://img.shields.io/badge/%E7%9C%9F%E5%87%B6-%E5%8D%A1%E5%B7%B4%E6%96%AF%E5%9F%BA%20TLS%20MITM-orange)](#-原理拆解卡巴斯基为什么要干这件事)
[![铁证](https://img.shields.io/badge/%E9%93%81%E8%AF%81-%E5%8F%91%E7%BB%99%E6%88%91%E7%9A%84%E8%AF%81%E4%B9%A6%E6%98%AF%20%2A.unionpayintl.com-yellowgreen)](#阶段三解剖证书链实锤真凶)
[![修复后](https://img.shields.io/badge/%E4%BF%AE%E5%A4%8D%E5%90%8E-5%2F5%20%E6%8E%A2%E6%B5%8B%E5%85%A8%E9%80%9A-brightgreen)](#-效果验证)

</div>

---

## 📋 概述

> AI 编程智能体（DeepSeek Harness，下文简称 DSH）的 `web_search` 工具突然罢工，报错只有一句冷冰冰的 `TypeError: fetch failed`。
>
> 排查过程一路反转：**配置检查——清白；网络连通——通畅；API 密钥——齐全**。三份"不在场证明"同时成立，凶手另有其人。
>
> 最后用 Node 自带的 TLS 模块解剖证书链，真相浮出水面：这台机器上的**卡巴斯基**正在对 `api.deepseek.com` 做 HTTPS 中间人扫描，而且**注入了一张域名驴唇不对马嘴的证书**（`*.unionpayintl.com`，银联国际）。浏览器和 PowerShell 毫无感觉，因为它们信任卡巴斯基的自签根证书；**Node.js 不信任——而且就算你教它信任也没用，因为证书的主机名根本对不上**。
>
> 一次杀软排除项配置解决战斗。本文完整记录五阶段排查路径、事故原理链，以及一个很多人踩过的坑：**Node.js 的网络栈和 Windows 系统证书库之间隔着一道断层**。

## 🖥️ 环境基线

| 项目 | 详情 |
| :--- | :--- |
| **操作系统** | Windows 11 专业版（build 26300） |
| **出事的运行时** | Node.js **v24.20.0**（DSH 宿主，内置 fetch 基于 undici） |
| **被劫持的目标** | `https://api.deepseek.com/anthropic/v1/messages`（DeepSeek 官方搜索端点） |
| **肇事软件** | 卡巴斯基个人版，特征：`Kaspersky Anti-Virus Personal Root Certificate`（已注入系统根证书库，有效期至 2036-09-11） |
| **故障形态** | **间歇性** `TypeError: fetch failed`（cause: `SELF_SIGNED_CERT_IN_CHAIN`），偶发能成功 |
| **对照通道** | PowerShell `Invoke-WebRequest`（走 Schannel/系统证书库）**始终正常** |

## 🎯 排查目标

- [x] 目标一：定位 `web_search` 间歇性失败的**根因**（而不是"重启试试"）
- [x] 目标二：区分责任——**DSH 配置问题、网络问题、还是本机第三方软件**
- [x] 目标三：给出可复制的**诊断工具箱**，下次遇到同类问题按图索骥

## 🛠️ 排查记录

### 阶段一：排除配置嫌疑 —— "出厂默认反而是对的"

第一反应是端点或密钥配错了。逐项核对：

```powershell
# ① 用户配置文件里有没有搜索相关的覆盖项？
Select-String -Path $env:USERPROFILE\.dsh\settings.yaml -Pattern 'search|baseURL'
# ② 环境变量有没有指错端点？
Write-Host "[$env:DEEPSEEK_SEARCH_BASE_URL]"     # 空
# ③ 凭据在不在？（只看键名，不显示值）
```

结果：配置文件里唯一的 `baseURL` 是聊天模型（阿里云百炼端点）的，与搜索无关；环境变量未设置；凭据存储里 `DEEPSEEK_API_KEY` 存在。再查插件源码文档，发现 `https://api.deepseek.com/anthropic/v1/messages` 就是 `web-search-deepseek` 插件的**出厂默认值**。

> [!NOTE]
> 三条结论：端点是官方默认、没被人改过；密钥能正常解析（后来报错发生在"请求发出之后"，凭据校验在发出之前，能发出请求说明凭据已过关）；配置层面**无罪**。排除法 -1。

### 阶段二：双栈对比 —— "网络通了，但只通了一半"

同一时刻、同一目标，分别用两套 TLS 栈去敲门：

```powershell
# PowerShell 栈（Schannel + Windows 系统证书库）
Invoke-WebRequest -Uri 'https://api.deepseek.com' -Method Head -TimeoutSec 10
# → 拿到 HTTP 401（没带密钥的正常拒绝 = TLS 握手成功 = 网络通畅）

# Node 栈（undici + Node 自带 CA 列表）
node -e "fetch('https://api.deepseek.com',{method:'HEAD'})
  .then(r=>console.log('OK',r.status))
  .catch(e=>console.log('ERR',e.cause?.code||e.message))"
# → ERR SELF_SIGNED_CERT_IN_CHAIN
```

**网络没问题，是 Node 不信这条 TLS 连接。** `SELF_SIGNED_CERT_IN_CHAIN` 意味着收到的证书链里有个自签证书——正常的公网 TLS 链不该有。这是中间人扫描的经典指纹。

### 阶段三：解剖证书链 —— 实锤真凶

用 Node 的 `tls` 模块直接抓取服务端呈递的证书链（`rejectUnauthorized:false` 仅用于取证观察）：

```powershell
node -e "const tls=require('tls');const s=tls.connect({host:'api.deepseek.com',port:443,rejectUnauthorized:false},()=>{
  let cur=s.getPeerCertificate(true);const seen=new Set();
  while(cur&&!seen.has(cur.fingerprint256)){seen.add(cur.fingerprint256);
    console.log('subject:',JSON.stringify(cur.subject),'issuer:',JSON.stringify(cur.issuer));
    cur=cur.issuerCertificate}
  s.end()});s.on('error',e=>console.log('ERR',e.message))"
```

> 失败尝试也要记：第一版单行脚本把 subject 当字符串 `JSON.parse`，直接炸了个 `TypeError: Cannot convert object to primitive value`——Node 里 `cert.subject` 本来就是对象。改成直接序列化后拿到了下面的链。另配一条打印 `dns_names` 的命令单查 SAN。

拿到的链（输出摘录）：

```text
subject:  {"O":"UnionPay International Co., Ltd.","CN":"*.unionpayintl.com"}
issuer:   {"O":"AO Kaspersky Lab","CN":"Kaspersky Anti-Virus Personal Root Certificate"}
SAN:      DNS:*.unionpayintl.com, DNS:unionpayintl.com
valid_to: Mar 16 02:58:16 2027 GMT
```

信息量爆炸，两条定罪：

1. **签发者是卡巴斯基自签根证书** → 本机杀软正在做 TLS 中间人拦截（它的根证书静静躺在 `Cert:\LocalMachine\Root` 里，所以浏览器和 PowerShell 全程无感知）；
2. **证书主体是银联国际的域名，SAN 里压根没有 `api.deepseek.com`** → 卡巴斯基呈递了一张**串线的假证书**。这直接判了"让 Node 信任卡巴斯基根证书"方案（`NODE_EXTRA_CA_CERTS`）的死刑：信任过了，主机名校验也必挂（`ERR_TLS_CERT_ALTNAME_INVALID`）。

### 阶段四：解释"时好时坏" —— 拦截是概率性的

如果卡巴斯基每次都劫持，故障应该是 100% 失败。实测三连发：

```text
0 OK 401        ← 直通真服务器，Node 的 Mozilla CA 列表认得真证书
1 OK 401        ← 同上
2 ERR fetch failed | SELF_SIGNED_CERT_IN_CHAIN   ← 被劫持，撞上串线证书
```

**同一目标、毫秒间隔，结果随机漂移**——劫持发生在连接调度层，命中与否看运气。这完美解释了"搜索十次挂五次、偶尔又成功"的诡异现象，也解释了为什么中途某一次真实搜索竟然成功返回了结果。

> [!TIP]
> 排查"偶发网络失败"时，**循环探测 + 打印 `e.cause.code`** 比反复手动点重试高效得多。间歇性不是玄学，通常是负载均衡/代理池/扫描调度里存在"好路径 + 坏路径"并存。

### 阶段五：修复与验证

修复方式只有一行字：**在卡巴斯基里让 `api.deepseek.com` 免检**。

卡巴斯基 → 设置 → **网络设置 → 加密连接扫描** → 在「**不扫描以下地址**」列表添加 `api.deepseek.com`（本次由机主本人在卡巴斯基 GUI 中手动操作完成，改完即生效，无需重启 DSH）。

> [!WARNING]
> 免检=该域名的流量不再被深度检测，防护强度打折。只给**可信域名**开这个口子（卡巴斯基官方知识库同样强调"仅添加受信任网站，可先上威胁情报门户查验"）。另一条看似更"彻底"的路——全局关闭加密连接扫描——会削弱整机的反钓鱼/反恶意下载能力，不推荐。

修复后复测：

```text
1 OK 401   2 OK 401   3 OK 401   4 OK 401   5 OK 401   ← 5/5 全通，再无随机劫持
web_search "DeepSeek 最新模型 新闻"                    ← 一次成功，返回完整结构化结果
```

## ⚗️ 原理拆解：卡巴斯基为什么要干这件事

### 1. 为什么要解密你的 HTTPS？

卡巴斯基官方知识库（错误码文章 13720）说得很直白：它使用自家 SSL 证书**解密加密流量**，以便网页反病毒、反钓鱼、Safe Money（金融交易保护）等组件检查**明文内容**。不拦截就无法扫描，而恶意下载、钓鱼表单、漏洞利用页大多藏在 HTTPS 里——这是所有带"Web 防护"的杀软/企业网关的共同逻辑。

**为什么轮到了 DeepSeek？** 我的推断（结合证据，非官方说明）：卡巴斯基的加密扫描对**金融/支付类网站优先**（Safe Money 白名单机制），而 DeepSeek 提供付费 API 与订阅入口，域名分类很可能命中了"支付/金融"类——证据就是它呈递的那张证书：`*.unionpayintl.com`（银联国际）明显是从卡巴斯基内部的**银行/支付类证书缓存池**里抓出来复用的一张。

### 2. 为什么证书会"串线"？

这并非本机的孤例，而是有历史案的病根：2017 年 Google Project Zero 公开点名卡巴斯基的 SSL 拦截模块——其代理**以过于简单的方式存储/复用站点证书**，攻击者可诱导它对任意域名呈递另一域名的证书，制造"TLS 证书碰撞"（[ZDNet 报道](https://www.zdnet.com/article/project-zero-calls-out-kaspersky-av-for-ssl-interception-practices/)、[SecurityWeek](https://www.securityweek.com/google-researcher-finds-certificate-flaws-kaspersky-products/)、[TechTarget](https://www.techtarget.com/searchsecurity/news/450410423/SSL-certificate-validation-flaw-discovered-in-Kaspersky-AV-software)）。当年打了补丁，但"从池子里取证书、域名对不上"的碰撞特征在今日版本上依然可见（至少在对非浏览器进程的注入路径上）。规范做法本应是：对每个被扫描的域名**动态签发一张 SAN 匹配该域名的叶子证书**。

### 3. 为什么浏览器没事，偏偏 Node 死了？

**两套信任库的断层**，这是全文最值钱的通用知识点：

| TLS 栈 | 信任根来源 | 本机表现 |
| :--- | :--- | :--- |
| Windows 原生（Schannel：IE/Edge 部分路径、PowerShell、.NET 默认、**curl**、Go on Windows） | Windows 证书库——卡巴斯基装根证书时会注册进去 | ✅ 全部正常 |
| Chromium/Firefox | 同样默认用系统证书库（Firefox 可用自身库） | ✅ 正常 |
| **Node.js / Bun**（内置 fetch、https 模块，undici） | **自带打包的 Mozilla CA 集合，从不读系统库** | ❌ 撞墙 |
| Python `requests`、Java 部分场景 | 各自信任库/`certifi` | ❌ 同理会撞墙 |

所以这类事故的通用画像就是：**"浏览器什么都好，一用脚本/CLI 工具访问某些站点就报证书错误"**。npm 装包撞上 Kaspersky 报 `SELF_SIGNED_CERT_IN_CHAIN` 就是一模一样的家族病例（[StackOverflow 案例](https://stackoverflow.com/questions/51865490/npm-code-self-signed-cert-in-chain-with-kaspersky-on-mac)）。

> [!IMPORTANT]
> 两条路要分清：企业合规 MITM 代理（Zscaler/Netskope 这类，**签发域名匹配的证书**）→ 正确姿势是把企业根证书喂给 Node（`NODE_EXTRA_CA_CERTS`），信任后一切正常。而本案这种**杀软串线证书** → `NODE_EXTRA_CA_CERTS` 救不了（信任过了主机名也挂），只能从杀软侧加排除。诊断时先看证书 SAN 匹不匹配，决定走哪条路。

## 📊 效果验证

| 指标 | 修复前 | 修复后 |
| :--- | :--- | :--- |
| Node HEAD ×5（`api.deepseek.com`） | 随机 2~4/5 通，间歇 `SELF_SIGNED_CERT_IN_CHAIN` | **5/5 全通** |
| `web_search` 工具 | 多次连续失败，偶发成功 | 连续一次成功，结果完整 |
| DSH 配置改动 | — | **零改动**（端点、密钥、环境变量原样） |
| 卡巴斯基改动 | — | 仅 `api.deepseek.com` 加入加密扫描排除，全局防护保留 |
| 浏览器/PowerShell | 本来就没受影响 | 无变化 |

## 🔍 结论速查（给遇到同款问题的你）

1. **症状**：Node 系工具（node fetch/npm/pnpm/Claude 类 CLI/各类 Agent）间歇性 `TypeError: fetch failed`，cause `SELF_SIGNED_CERT_IN_CHAIN`；浏览器完全正常
2. **确诊命令**（10 秒）：`node -e` 连一次目标站点打印证书 issuer——看到 `Kaspersky / Avast / ESET / Bitdefender ... Root Certificate` 即宣告破案
3. **看 SAN**：域名匹配 → 用 `NODE_EXTRA_CA_CERTS` 喂根证书；域名不匹配（本案）→ 只能去杀软加排除项
4. **别做的事**：不要 `NODE_TLS_REJECT_UNAUTHORIZED=0` 全局裸奔——那不是修复，是把整台机器的 TLS 安全模型关掉

## 💡 心得

- **双栈对比是中间人问题的显微镜**：PowerShell（系统栈）和 Node（自带栈）同一秒各打一次，一个通一个不通，直接锁定"信任链被污染"，跳过一半弯路
- **间歇性故障要敢于下定量结论**：连发 3~5 次拿到 OK/ERR 混合样本，比单次"复现不了"有说服力得多——随机性本身就是证据
- **杀软是现代开发环境里最有权力的"网络组件"**：它默默注册根证书、劫持 TLS、还自带串线 bug，而报错信息（`fetch failed`）离真相隔了三层抽象。AI 智能体替人干活时，这种底层事故恰恰最容易撞见
- **出厂默认未必是错的**：阶段一差点把"端点配置有问题"写进结论，源码文档救了回来——默认值本来就是官方正确值

## 📚 参考与致谢

- [Kaspersky 官方知识库 13720：加密连接扫描出错与排除项指引](https://support.kaspersky.com/us/error/other/13720)
- [Kaspersky 官方：如何更改加密连接设置（157530）](https://support.kaspersky.com/kaspersky-for-windows/21.23/157530)
- [ZDNet：Project Zero calls out Kaspersky AV for SSL interception practices](https://www.zdnet.com/article/project-zero-calls-out-kaspersky-av-for-ssl-interception-practices/)
- [SecurityWeek：Google Researcher Finds Certificate Flaws in Kaspersky Products](https://www.securityweek.com/google-researcher-finds-certificate-flaws-kaspersky-products/)
- [TechTarget：SSL certificate validation flaw discovered in Kaspersky AV software](https://www.techtarget.com/searchsecurity/news/450410423/SSL-certificate-validation-flaw-discovered-in-Kaspersky-AV-software)
- [StackOverflow：npm ERR SELF_SIGNED_CERT_IN_CHAIN with Kaspersky on Mac](https://stackoverflow.com/questions/51865490/npm-code-self-signed-cert-in-chain-with-kaspersky-on-mac)
- [Node.js CLI 文档：`--use-openssl-ca` 与内置 CA 集合](https://nodejs.org/api/cli.html#use-openssl-ca)
- [Node.js GitHub issue #10002：为何 Node 不用系统证书库（设计取舍长贴）](https://github.com/nodejs/node/issues/10002)
- 事故主角：DeepSeek Harness 的 `dsh-web-search-deepseek` 插件（每次搜索 = 一次完整模型调用，报错文案自带端点诊断指引）

---

## 🤖 AI 生成声明

> [!IMPORTANT]
> 本文由 **AI 助手辅助生成**（会话运行于 DeepSeek Harness 智能体运行时，撰写模型 qwen3.8-flash，前期部分诊断轮次由 deepseek-flash 执行）。文中所有命令、错误码、证书信息、探测计数与修复验证均来自该会话在真实环境中的逐步执行输出，非虚构演绎；唯一的环境变更操作（卡巴斯基加密扫描排除项）由机主本人手动完成。外部报道仅作背景佐证，与本机现象的关联推断已标注"推断"字样。
>
> 环境与软件版本具有个体差异，**本文仅供技术参考，不构成任何保证**。

---

<div align="center">

**本机现状：`api.deepseek.com` 直连满血 · 5/5 探测全通 · 全局防护未降级**

*完——2026.09.15，于证书链解剖现场*

</div>
