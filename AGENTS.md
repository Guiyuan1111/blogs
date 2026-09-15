# AGENTS.md — Guiyuan1111/blogs

本仓库是机主的个人技术折腾博客（GitHub: [Guiyuan1111/blogs](https://github.com/Guiyuan1111/blogs)，公开仓库，分支 `main`）。任何 AI 会话在本目录工作时，遵守以下规则。

## 仓库职责

- `posts/YYYY-MM-DD-<ascii-slug>.md` —— 博客文章，一文一件
- `README.md` —— 仓库首页，含「📚 文章目录」表，**每次新增/修改文章必须同步更新**
- `.zcode/skills/blog-push/SKILL.md` —— "发博客"完整工作流技能（写作规范、红线检查、推送流程），涉及发博客的操作以该技能为准

## 发布流程速记

1. 写文章（风格参考 `posts/` 已有文章：GitHub 技术博客风、中文、徽章 + 提示块 + 表格）
2. 红线自查：无隐私（邮箱/QQ/手机号/序列号/含用户名的路径）、文末有 AI 生成声明（ZCode/GLM、真实执行记录、仅供参考）、数据全部来自实测
3. 更新 `README.md` 目录表
4. `git add -A && git commit -m "docs: <标题>" && git push`（远程 origin 为 HTTPS，gh 凭据代理已配置；推送失败先跑 `gh auth setup-git`）

## 红线（不可违反）

- 不得把机主隐私写入文章或提交：邮箱、QQ 号、手机号、硬件序列号、账户 SID、`Guiyuan1111` 用户名出现的本机路径
- 不得虚构操作结果：所有错误码、计数、时间线必须来自真实执行输出
- 不得删除或改写已有文章的 AI 生成声明
- 远程保持 HTTPS（`https://github.com/Guiyuan1111/blogs.git`），不要改回 SSH

## 背景备忘

- 机主：技术爱好者，偏好轻量/精简系统、硬件折腾；中文交流
- 本仓库第一篇文章（2026-09-15）：精简版 Windows 11 绝症治愈实录（25H2 精简版 → 26H2 官方完整版，4114 组件损坏清零）
