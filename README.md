<div align="center">

# 📝 Guiyuan1111 的折腾博客

**记录每一次与系统和硬件的较量：修复、优化、踩坑与重生**

[![GitHub](https://img.shields.io/badge/GitHub-Guiyuan1111-181717?logo=github)](https://github.com/Guiyuan1111)
[![Posts](https://img.shields.io/badge/文章数-2-blue)](#-文章目录)

</div>

---

## 👋 关于本仓库

个人技术折腾博客的存档地。每次把电脑搞坏又救活、把性能压榨到极限、把软件玩出花的过程，都会记录在这里。

> 相信的过程只有两步：先拆开，再装回去。装不回去的，就写篇博客。

## 📚 文章目录

| 日期 | 标题 | 简介 |
| :--- | :--- | :--- |
| 2026-09-15 | [杀软 TLS 中间人扫描致 Node.js `fetch failed`：`SELF_SIGNED_CERT_IN_CHAIN` 的取证定位与修复](posts/2026-09-15-kaspersky-tls-mitm-nodejs.md) | 同一端点 Node（undici）间歇性证书报错、PowerShell（Schannel）稳定 401；证书链取证定位 Kaspersky 加密扫描与 SAN 不匹配的叶子证书，含双栈信任库差异、修复路线判定树与 10 秒确诊命令 |
| 2026-09-15 | [精简版 Windows 11 更新链路瘫痪（`0x80073712`，4114 处组件损坏）：诊断与 UUP 就地修复升级](posts/2026-09-15-windows11-lite-rescue.md) | 第三方"轻度精简"镜像出厂锁死更新 + 组件存储损坏 4114 处 + CBS 日志关闭 + WinRE 删除；DISM/SFC/云重置/官方 ISO 全部结构性失效，改用 UUP 拼制镜像就地修复升级到 26H2 (26300.9539)，数据 100% 保留；含四层破坏模型、七手段失败矩阵与可照抄速查 |

---

## 🤖 AI 生成声明

本仓库文章由 AI 助手辅助生成（ZCode / GLM 模型），所有操作均在真实环境中实际执行并记录，数据来自实测输出；关键决策经本人确认。内容仅供技术参考，不构成任何保证。
