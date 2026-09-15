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
| 2026-09-15 | [【已解决】DeepSeek Harness 的 web_search 报错 `TypeError: fetch failed`（`SELF_SIGNED_CERT_IN_CHAIN` · 卡巴斯基 TLS 中间人扫描）](posts/2026-09-15-deepseek-harness-web-search-fetch-failed-self-signed-cert-in-chain.md) | Node（undici）间歇性证书报错、PowerShell（Schannel）稳定 401；证书链取证定位 Kaspersky 加密连接扫描与 SAN 不匹配的叶子证书，给出 `SELF_SIGNED_CERT_IN_CHAIN` 10 秒确诊命令、双栈信任库差异与 `NODE_EXTRA_CA_CERTS` 为何无效的判定树 |
| 2026-09-15 | [【已解决】Windows 11 精简版更新报错 `0x80073712`：DISM 卡死、sfc 无法启动、WinRE 被删（组件存储损坏 · UUP 镜像就地升级修复）](posts/2026-09-15-windows11-update-0x80073712-0x800f0915-uup-upgrade.md) | 精简镜像锁死更新 + 组件存储损坏 4114 处 + CBS 日志关闭 + WinRE 删除；`0x80073712` / `0x800f0915` 下 DISM、SFC、云重置、官方 ISO 全部结构性失效，改用 UUP 拼制镜像就地升级到 26H2 (26300.9539)，数据 100% 保留；含四层破坏模型、七手段失败矩阵与可照抄速查 |

---

## 🤖 AI 生成声明

本仓库文章由 AI 助手辅助生成（ZCode / GLM 模型），所有操作均在真实环境中实际执行并记录，数据来自实测输出；关键决策经本人确认。内容仅供技术参考，不构成任何保证。
