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

将来换数据库：改 `wrangler.toml` 和 `tools/deploy.py` 里 `D1_UUID` 那一行，改成新的 Database ID，再跑一次部署脚本。

---

## 九、Cloudflare Pages 部署（前端已上线）

前端已经上线：`https://couple-quiz-ajh.pages.dev`。

原理：部署脚本把 `public/` 文件夹里的每个文件传到 Cloudflare，生成一个新版本。每次部署都会得到一个预览链接（比如 `https://abc123.couple-quiz-ajh.pages.dev`），主网址自动指向最新版。

如果你想在面板里亲眼看到：

1. 登录 Cloudflare → 左侧 **Workers & Pages** → 点 `couple-quiz`；
2. **Deployments** 标签就是历次发布记录，点进去能看到每次改了什么、成功还是失败。

---

## 十、Worker 配置（后端已上线）

后端已经上线：`https://couple-quiz-api.gardenia937.workers.dev`。

- 代码文件：`worker.js`；
- 配置文件：`wrangler.toml`（里面是数据库 ID 和前后端网址，没有任何秘密）；
- 这个项目**不需要任何 Secrets**（没有支付、没有登录、没有管理员后门，创建者权限靠的是随机生成的私人管理链接）。

查看方法：面板 → **Workers & Pages** → 点 `couple-quiz-api` → **Settings** 能看到绑定和变量。

> 踩坑记录：通过 API 上传的**全新** Worker，`workers.dev` 网址默认是关闭的（表现为 404 `error code: 1042`），必须调一次 subdomain 接口打开。部署脚本里已经自动处理了这一步。

---

## 十一、环境变量

这个项目只有 3 个公开变量（都在 `wrangler.toml` 和 `tools/deploy.py` 里，不是秘密）：

| 变量 | 值 | 作用 |
|---|---|---|
| `ALLOWED_ORIGIN` | `https://couple-quiz-ajh.pages.dev` | 只允许这个网址调用后端（防盗用） |
| `PUBLIC_BASE_URL` | 同上 | 生成分享链接的前缀 |
| `DISCOVER_URL` | `https://peekiva.com` | Discover More 按钮的目标 |

绑定自定义域名后（第二十节），记得把前两个改成你的新域名再重新部署。

---

## 十二、本地测试

- **后端自动化测试**：运行 `python3 tests/e2e_api.py`，35 项检查（创建→答题→计时→权限→分享隐私→删除）会在 1 分钟内跑完，最后显示 `35 passed, 0 failed`。它用的是线上 API，会自己创建测试问卷、自己删掉，不影响真实数据。
- **前端测试**：没有安装 Node 的需求。改完字后直接部署（第十九节），用手机浏览器打开主网址亲自点一遍：首页 → Create → 选模板 → 改两道题 → Create Quiz → 复制答题链接到另一个浏览器（或微信里）→ 输入名字答完 → 回管理链接看答案和用时。
- **语法检查**：改完 `worker.js` 或 `public/*.js` 后如果不放心，Mac 上可以跑 JXA 校验（只是检查括号语法，不部署）：
  `osascript -l JavaScript -e "ObjC.import('Foundation'); var s = $.NSString.stringWithContentsOfFileEncodingError('worker.js', $.NSUTF8StringEncoding, null).js; new Function(s.replace('export default {','const d = {'));"`

---

## 十三、生产部署

生产环境 = 现在已经在跑的线上版本，不需要额外操作。

- 主网址：`https://couple-quiz-ajh.pages.dev`（永远指向最新一次成功部署）；
- 每次部署会额外产生一个带版本号的预览链接，旧版本保留在 Deployments 记录里，出问题可以一键 **Rollback**（面板 → Deployments → 找到上一个好的版本 → 右边三个点 → Rollback）。

---

## 十四、如何修改网站英文文案

所有用户看到的英文都在两个文件里：

1. `public/app.js` —— 10 个页面的标题、按钮、提示语（比如 `You're done.`、`Copy Link`）。用编辑器打开，搜索那句英文，改引号里面的字，**不要动引号和标点之外的代码**；
2. `public/index.html` —— 首页标题（浏览器标签）、SEO 描述、页脚邮箱。

改完后跑 `python3 tools/deploy.py --pages`，约半分钟生效。

## 十五、如何修改预设题目

打开 `public/templates.js`，8 个模板从上到下排列，每个题目长这样：

- 选择题：`{ type: "choice", text: "问题？", options: ["选项A", "选项B", "选项C"] }`（2–6 个选项）；
- 是非题：`{ type: "yesno", text: "问题？" }`；
- 简答题：`{ type: "short", text: "问题？" }`。

照着格式增删改就行，改完跑 `python3 tools/deploy.py --pages`。

## 十六、如何添加新的题型

目前 3 种题型（选择 / 是非 / 简答）已经覆盖情侣问卷 99% 的场景，不建议加。

如果以后非加不可，需要同时改 3 处（前端展示 `app.js` 的答题页 + 编辑器 + 后端 `worker.js` 的答案校验），牵一发动三。请先告诉我需求，我来帮你加。

---

## 十七、如何查看 D1 数据

方法一（面板，最直观）：

1. 登录 Cloudflare → 左侧 **Storage & Databases** → **D1 SQL Database** → 点 `couple-quiz-db`；
2. 点 **Console** 标签，在输入框里写 SQL，点 **Run**。常用语句：
   - 看最近的问卷：`SELECT id, title, response_count, created_at FROM quizzes ORDER BY created_at DESC LIMIT 20;`
   - 看某问卷的回答：`SELECT responder_name, total_time_ms, completed_at FROM responses WHERE quiz_id = '问卷短ID' ORDER BY completed_at DESC;`
   - 看某人的每题用时：`SELECT q.question_text, a.answer_text, a.time_spent_ms FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.response_id = '回答ID' ORDER BY q.question_order;`
   - 时间是毫秒时间戳，看不懂的话包一层：`SELECT responder_name, datetime(completed_at/1000, 'unixepoch') AS finished FROM responses ORDER BY completed_at DESC LIMIT 20;`

方法二（命令行）：把 SQL 写进 `--command`，比如
`CF_API_TOKEN=你的Token python3 -c "..."` 太长了，推荐直接用面板。

> 注意：`creator_token` 列是用户的私人管理钥匙，**不要截图发给别人**。

---

## 十八、如何查看错误

1. 后端日志：面板 → **Workers & Pages** → `couple-quiz-api` → **Logs** 标签 → **Begin log stream**，然后自己操作一遍网站，错误会实时显示出来；
2. 前端问题：手机浏览器里如果页面空白，99% 是网络问题，刷新一次就好；如果持续空白，把网址发给我，我来查；
3. 用户反馈问卷打不开：先问他要链接，区分是答题链接（`/quiz/xxx`）还是管理链接（`/manage/xxx`），再看是 “doesn't exist”（ID 错了/问卷被删）还是 “no longer available”（被创建者关闭了）。

---

## 十九、如何更新网站

记住这一节就行，其他都是备用知识：

1. 在电脑上打开 `peekiva-couple-quiz` 文件夹改文件（改字参考第十四、十五节）；
2. 打开终端，进入这个文件夹；
3. 设置 Token（Mac）：`export CF_API_TOKEN="粘贴你的Token"`；
4. 运行（选一个）：
   - 只改了 `public/` 里的东西：`python3 tools/deploy.py --pages`
   - 只改了 `worker.js`：`python3 tools/deploy.py --worker`
   - 数据库结构（`schema.sql`）动了：先 `--migrate` 再 `--worker`
   - 拿不准：直接 `python3 tools/deploy.py --all`（三步全做，最省心）；
5. 看到 `DONE` 后等约 30 秒，用**无痕窗口**打开主网址验证；
6. 备份代码到 GitHub（建议每次改完都做）：
   `git add -A && git commit -m "一句话描述改了什么" && git push origin main`。

---

## 二十、常见问题

1. **我想用自己的域名，比如 quiz.peekiva.com，怎么做？**
   面板 → **Workers & Pages** → 点 `couple-quiz` → **Custom domains** → **Set up a custom domain**，按提示去你的域名商加一条 CNAME。生效后：把 `wrangler.toml` 和 `tools/deploy.py` 里的旧网址换成新域名，跑一次 `--all`，再把 `public/_headers` 里旧网址也换掉跑一次 `--pages`。
2. **主网址的 `-ajh` 后缀能去掉吗？**
   `couple-quiz.pages.dev` 这个名字被别人先用了，去不掉。但绑定自定义域名后，用户就只看到你的域名了，主网址只是备用。
3. **用户说管理链接丢了怎么办？**
   找不回来（我们也没有他的账号信息）。只能让他用答题链接重新答一份新的，或者以后提醒用户建完问卷先收藏管理链接。
4. **有人刷垃圾问卷怎么办？**
   后端有限流（同一网络 1 小时最多建 10 个问卷、30 个回答）。如果还被刷，在 D1 里删掉对应行即可：`DELETE FROM quizzes WHERE id = '问卷短ID';`（顺带把它的 questions/responses/answers 一起删，或直接用管理链接的 Delete 按钮）。
5. **网站完全免费，Cloudflare 会收费吗？**
   不会。Pages、Workers、D1 的免费额度对这个量级绰绰有余（每天几万次访问以内不用担心）。
6. **页眉只有 logo，想加按钮/改 logo 样式？**
   页眉在 `public/index.html`（只有一行 logo），样式在 `public/styles.css` 的 `.brand`。页脚每个页面都有的粉色 **Discover More** 卡片，文字在 `public/app.js` 的 `setFooterCta` 函数里，链接目标是开头的 `DISCOVER_URL`。
7. **不想要某个预设模板了？**
   直接从 `public/templates.js` 里删掉那一段（从 `{ id: "..."` 到对应的 `}`），部署即生效。
8. **备份？**
   代码在 GitHub（`gardenia937/peekiva-couple-quiz`），数据库可以定期在 D1 面板点 **Export** 导出。建议每月导一次。