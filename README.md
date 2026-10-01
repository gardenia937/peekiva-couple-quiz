# Peekiva 情侣互动问卷（Couple Quiz）— 中文部署与运维手册

> 给不会编程的你：这份 README 是这个项目的“说明书 + 操作手册”。
> 按照顺序一步一步点鼠标，就能拥有一个真实可用的网站。
> 全程不需要写代码。需要改字的地方，我会告诉你打开哪个文件、改哪一行。

**线上地址（已上线）：**

- 网站首页：`https://couple-quiz-ajh.pages.dev`
- 后端 API：`https://couple-quiz-api.gardenia937.workers.dev`（浏览器打开显示服务正常即可）
- GitHub 代码仓库：`https://github.com/gardenia937/peekiva-couple-quiz`

**账号归属：** 网站前端（Pages）、后端（Worker）、数据库（D1）全部在 Cloudflare 账号 `gardennia937@gmail.com` 下面。

---

## 一、这个项目是什么

一个**完全免费**的情侣互动问卷工具，属于 Peekiva 体系，作用是带来传播和流量。

真实使用流程：

1. 一个人点 **Create a Quiz**，选个模板（比如 How Well Do You Know Me?），改改题目；
2. 点 **Create Quiz**，得到两个链接：
   - **答题链接**（比如 `https://couple-quiz-ajh.pages.dev/quiz/7Hk92Lm`）→ 发给另一半；
   - **私人管理链接**（比如 `https://couple-quiz-ajh.pages.dev/manage/很长一串字符`）→ 只有创建者能打开，用来看答案；
3. 另一半打开答题链接，输入名字，逐题回答，提交；
4. 创建者打开自己的私人管理链接，看到对方每一题的答案，以及**每一题想了多久**（比如 7.4 秒、38.6 秒），还有总用时和平均用时。

特点：

- 全部免费，没有 PayPal、没有付费墙、没有会员；
- 不用注册、不用装 App，手机和电脑都能用；
- 一个问卷可以被**多人**回答（伴侣、朋友、家人、婚礼小游戏都行）；
- 答案只有拿着私人管理链接的人能看，答题链接只能答题；
- 分享出去的“战绩预览页”只显示名字和用时，**不公开具体答案**。

---

## 二、项目结构

```
peekiva-couple-quiz/
├── public/                 # 网站前端（Cloudflare Pages 部署的就是这个文件夹）
│   ├── index.html          # 页面骨架 + SEO/分享标题 + 页脚邮箱
│   ├── styles.css          # 全部样式（粉白编辑风、手机优先）
│   ├── app.js              # 全部页面逻辑（10 个页面都在这里）
│   ├── templates.js        # 8 个预设问卷模板的英文题目
│   ├── _redirects          # 告诉 Pages：所有页面都走 index.html（单页应用必需）
│   └── _headers            # 安全头（防点击劫持等）
├── worker.js               # 后端 API（Cloudflare Worker）
├── schema.sql              # 数据库表结构（Cloudflare D1）
├── wrangler.toml           # Worker 配置文件（数据库 ID、前后端网址）
├── .env.example            # 环境变量示例（没有秘密，照抄就行）
├── tools/
│   └── deploy.py           # 一键部署脚本（升级网站只用它，见第十九节）
└── tests/
    └── e2e_api.py          # 35 项自动化检查（见第十二节）
```

数据库里有 5 张表：

| 表 | 存什么 |
|---|---|
| `quizzes` | 问卷（标题、简介、公开短 ID、私人管理 token） |
| `questions` | 题目（文字、题型、选项） |
| `responses` | 谁回答了（名字、开始/完成时间、总用时） |
| `answers` | 每一题的答案 + 每一题的用时 |
| `shares` | 分享出去的“战绩预览”（只有标题、名字、用时，没有答案） |

---

## 三、需要准备什么

1. 一台能上网的电脑（Mac 或 Windows 都行）；
2. Cloudflare 账号 `gardennia937@gmail.com`（已经注册好，见第四节）；
3. GitHub 账号 `gardenia937`（代码备份在这里）；
4. 一个 Cloudflare API Token（只用来跑部署脚本，**绝不发给别人、不贴进聊天**）：
   - 打开 `https://dash.cloudflare.com` 登录；
   - 右上角头像 → **My Profile** → 左侧 **API Tokens** → **Create Token**；
   - 选 **Edit Cloudflare Workers** 模板，Account 选 `Gardennia937@gmail.com's Account`；
   - 还要点 **Add more** 加上 **Pages → Edit** 和 **D1 → Edit** 权限；
   - **Continue to summary → Create Token**，把 Token 复制到你的密码管理器里。

---

## 四、Cloudflare 注册

已经完成，跳过。账号信息：

- 登录邮箱：`gardennia937@gmail.com`；
- 打开 `https://dash.cloudflare.com` 登录后，左侧能看到 **Workers & Pages** 和 **D1**（在 Storage & Databases 下面）。

---

## 五、创建 D1（已完成，备用步骤）

D1 数据库已经建好：名字 `couple-quiz-db`。

如果将来你要给新项目再建一个，步骤是：

1. 登录 Cloudflare 面板 → 左侧 **Storage & Databases** → **D1 SQL Database** → **Create**；
2. 名字随便取（比如 `couple-quiz-db`）→ **Create**；
3. 点进数据库，把 **Database ID**（一长串字符）复制下来，后面填配置要用。

---

## 六、创建数据库（表已经建好，备用步骤）

表已经建好。如果将来数据库被删了要重建：

1. 电脑上装 Python（Mac 自带，Windows 去 python.org 下一个）；
2. 打开终端（Mac 叫“终端”，Windows 叫 PowerShell）；
3. 进入项目文件夹，比如 `cd "项目路径/peekiva-couple-quiz"`；
4. 设置 Token（只在当前窗口有效，关闭就失效）：
   - Mac：`export CF_API_TOKEN="把你的Token粘贴在这里"`；
   - Windows：`$env:CF_API_TOKEN="把你的Token粘贴在这里"`；
5. 运行：`python3 tools/deploy.py --migrate`；
6. 看到 `[migrate] OK` 就是成功。

---

## 七、执行 SQL migration

就是第六节那条命令：`python3 tools/deploy.py --migrate`。

它做的事情：把 `schema.sql` 里的建表语句一条一条发给 Cloudflare 执行。
看到 `[migrate] OK (10 statements)` 即成功。重复执行是安全的（建表语句都有 `IF NOT EXISTS`）。

---

## 八、绑定 D1（已配置好，原理说明）

“绑定”就是告诉后端 Worker：“你的数据库是这一个”。

- 配置位置：`wrangler.toml` 里 `[[d1_databases]]` 那一段（`database_id` 就是第五节复制的 ID）；
- 实际生效位置：部署脚本 `tools/deploy.py` 每次上传 Worker 时都会把绑定一起传上去；
- 验证方法：Cloudflare 面板 → **Workers & Pages** → 点 `couple-quiz-api` → **Settings** → **Bindings**，能看到 `DB → couple-quiz-db`。

将来换数据库：改 `wrangler.toml` 和 `tools/deploy.py` 里
...[truncated 8184 chars]