---
name: learnerhub-publish
description: 向知士荟（learnerhub.net）空间自动化发布文章。当用户要求把 D:\Guiyuan1111\blogs\posts 里的 Markdown 文章推送到 learnerhub.net 的空间（如 Guiyuan1111的博客 /spaces/3614）时使用。涵盖 Markdown 转换、表单自动化、Vue 数据模型直写、请求兜底与全部已踩坑项。
---

# 知士荟（learnerhub.net）文章自动发布技能

目标空间示例：`https://www.learnerhub.net/spaces/3614`（Guiyuan1111的博客）。
本技能假设你（AI）拥有浏览器自动化能力（如 ZCode 内置浏览器 / Playwright / CDP），且**用户已在浏览器里登录**。登录态保存在浏览器内，关闭浏览器或会话结束后需要用户重新登录——发布前先检查登录态（页面右上角是否显示用户名/「我的」菜单），未登录就停下来请用户登录，**绝不代替用户输入账号密码**。

## 一、总体流程

```
Markdown 源文件（D:\Guiyuan1111\blogs\posts\*.md）
  ↓ ① scripts/convert.mjs 转换（marked + Prism，输出站内原生 HTML）
  ↓ ② 打开 /spaces/3614/resources/new?type=online
  ↓ ③ 填标题 → 填摘要 → 选目录 → 点推荐标签
  ↓ ④ 正文注入：TinyMCE setContent + Vue 数据模型直写（两者缺一不可）
  ↓ ⑤ 终检（标题/摘要/正文/无校验错误）→ 点「创建」
  ↓ ⑥ 校验落地页 URL 变为 /resources-docs/<id>
```

## 二、环境准备（只需一次）

```bash
cd <工作目录> && npm init -y && npm install marked prismjs
```

转换脚本用法：写一个 manifest JSON（文章清单），然后 `node convert.mjs manifest.json`：

```json
[
  {
    "file": "D:/Guiyuan1111/blogs/posts/xxx.md",
    "title": "≤50字的标题（省略则自动取正文首个 H1 并去格式）",
    "summary": "≤150字的贡献内容摘要（必填）",
    "tags": ["标签1", "标签2"]
  }
]
```

输出 `out/article_N.html` 与 `out/meta.json`。转换规则（与站内「插入/编辑代码示例」格式对齐）：

- 代码围栏 → `<pre class="language-x">…Prism token span…</pre>`（无内层 `<code>`；语言别名 bat→batch、sh→bash；无语言围栏 → language-text）
- GitHub 提示框 `> [!NOTE]` 等 → 块引用内 `<span style="color:…;font-weight:600;">📌 NOTE</span>` 彩色标签
- 正文剥离首个 H1（它进标题字段）；徽章图、表格、行内代码原样保留

## 三、发布步骤（定位器全部经过实测）

页面 URL：`https://www.learnerhub.net/spaces/3614/resources/new?type=online`

| 步骤 | 操作 | 实测要点 |
| :-- | :-- | :-- |
| 标题 | textbox `文章标题（必填）` | **≤50 字**，超了提交时报"标题不能超过50个字" |
| 摘要 | textbox `贡献内容摘要（必填）` | ≤150 字，必填 |
| 目录 | button `选择目录` → dialog `选择目录` → 点文本 `根目录` → button `确定` | **必选**，否则报"请选择资源存放的目录"；节点是普通 generic 文本，非 treeitem |
| 标签 | 点「推荐标签」区域的关键词 chip（填完标题才会加载推荐） | 最多 5 个；chip 是 generic 文本，用 `getByText(name, {exact:true})` 定位 |
| 资源类型 | radiogroup 内文本 `原创` | **新建页可能没有默认选中**（首次实测是默认，第二次就没选）。radio input 是 aria-hidden 的，`check()` 会失败——直接 DOM 层 `label.el-radio` 的 `.click()`，并直接写 `form.originalType = 1` 兜底 |
| 创建 | button `创建` | 必填项齐全才解锁 |

## 四、核心技术：正文注入（最重要）

编辑器是 TinyMCE 5.9.2（Vue 包装组件 `tinymce-editor`，表单组件在创建页叫 `create-online-doc`，编辑页叫 `update-doc-online`）。

**关键认知：`tinymce.editors[0].setContent(html)` 只改编辑器显示，不会同步站点的 Vue 数据模型。** 只做 setContent 就点创建，发出去的还是模板/旧内容（第一次发布就这样翻车的）。正确做法是两者都写：

```js
// 在页面上下文执行；html 为转换后的 HTML 全文
const seen = new Set(); let formVm = null, tmed = null;
(function walk(vm) {
  if (!vm || seen.has(vm._uid)) return;
  seen.add(vm._uid);
  const name = vm.$options.name || vm.$options._componentTag || "";
  if (vm.$data && vm.$data.form && "content" in vm.$data.form) formVm = vm; // 发布表单
  if (name === "tinymce-editor") tmed = vm;
  (vm.$children || []).forEach(walk);
})(document.querySelector("#app").__vue__);

window.tinymce.editors[0].setContent(html);   // 视觉层
formVm.form.content = html;                    // 数据模型层（提交真正读取的）
if (tmed && "editorData" in tmed.$data) tmed.editorData = html; // 编辑器包装组件的 v-model
```

注入前先读 `formVm.form` 的 title/summary 做终检（见第五节陷阱），点创建前再读一遍 `formVm.form.content.length` 与关键标记（如文章小节标题）确认没被重置。

## 五、已踩坑清单（务必记住）

1. **表单会被页面重渲染清空**：标题填写后可能因推荐标签等异步请求触发重渲染而丢值。对策：标题→摘要→目录→标签→正文注入压成一次连贯批次，最后统一终检。
2. **悬浮遮挡导致点击超时**：固定顶栏和底部悬浮操作条（FormStickyActions）常盖住目标按钮。对策：先 `el.scrollIntoView({block:'center'})` + 等待 300~500ms 再点；仍超时就 DOM 层 `btn.click()`（Page 上下文 evaluate）。
3. **防重复提交锁**：保存/创建按钮点过后会 `disabled + is-disabled`，再次保存前需 `btn.disabled=false; btn.classList.remove('is-disabled')`。
4. **表单页拦截 SPA 导航**：在有未保存表单的页面 `goto()` 别的地址会 ERR_ABORTED（无对话框）。对策：先点「取消」正常退出；若页面卡死直接关标签页开新的。
5. **请求体结构**（请求兜底时用）：保存/创建都是
   `XHR POST https://api.learnerhub.net/v1/products/3614/pull_quests`，
   body 形如 `{"pl_action":"create|update","product_file_id":<id>,"title":"…","pull_quest_items":[{"class_type":"ProductSnippet","title":"…","content":"…正文HTML…", …}]}`
   **content 在 `pull_quest_items[0]` 里，不在顶层**——做请求改写时别只查顶层键。
6. **题图/封面/附件传不了**：浏览器沙箱不支持本地文件选择对话框。正文插图用外链 URL 没问题。
7. **标签只能选不能造**：直接往标签输入框打自定义词不会生成标签，只能点推荐/高频标签 chip。

## 六、请求层兜底（可选，最后手段）

若怀疑编辑器序列化丢内容，可在点创建/确认前装 XHR 拦截器，发送瞬间把 `pull_quest_items[*].content` 替换为指定 HTML（注意同时兼容 fetch）：

```js
const OS = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (body) {
  try {
    if (typeof body === "string" && body.indexOf("pull_quest_items") >= 0) {
      const parsed = JSON.parse(body);
      const fix = (o) => {
        if (!o || typeof o !== "object") return;
        if (typeof o.content === "string" && o.content.length > 500) o.content = window.__spanned;
        if (Array.isArray(o.pull_quest_items)) o.pull_quest_items.forEach(fix);
      };
      fix(parsed);
      body = JSON.stringify(parsed);
    }
  } catch (e) {}
  return OS.call(this, body);
};
```

## 七、已知限制（2026-09-17 实测）

- **服务端会剥离代码块里的 Prism 高亮 span**：代码块的 `<pre class="language-x">` 结构与语言标注能保存，但 token 着色会被服务端净化掉。老文章（如 35661）的颜色是早期存进去的——**不要让用户重新编辑保存老文章**，颜色会丢。此问题已整理成报告供用户提交站长。
- 编辑器视图里代码无颜色是正常的（编辑器内置 Prism 不含 powershell/batch 语法），以发布后页面为准。
- 登录态只在当前浏览器会话内有效。

## 八、发布后校验清单

- [ ] URL 变为 `/spaces/3614/resources-docs/<id>`
- [ ] 页面标题 = 文章标题
- [ ] 正文包含文章特有的小节标题（抽查 2~3 个）
- [ ] 标签 chip 数量正确、目录（根目录）正确
- [ ] 提示用户检查摘要与排版

## 九、文件清单

- `SKILL.md` —— 本文件
- `scripts/convert.mjs` —— Markdown → 站内格式转换器（依赖 marked + prismjs）
- `报告-致网站创建者.md` —— 自动化路径与高亮剥离问题的反馈报告
