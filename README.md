# 招聘自动打招呼助手（Boss 直聘 / 前程无忧）

Chrome + [篡改猴（Tampermonkey）](https://www.tampermonkey.net/) 用户脚本。

在 Boss 直聘自动打招呼（可选 VIP 自动追聊），在前程无忧自动投递简历。当前版本：**v2.16.2**

> 仅供个人求职效率提升使用。请控制频率，遵守平台规则，风险自负。

---

## 功能概览

| 平台 | 能力 |
|------|------|
| **Boss 直聘** | 自动打招呼、多关键词多城市搜岗、薪资区间/黑白名单过滤、排除外包、跳过已打招呼、自动翻页、VIP 自动追聊 |
| **前程无忧** | 自动投递、附言填写、公司性质筛选（国企/央企/外企）、黑白名单与外包过滤 |

其他特性：

- 页面右下角悬浮按钮打开控制面板（可拖拽）
- 配置保存在浏览器 `localStorage`
- 招呼语模板支持变量：`{jobName}`、`{company}`、`{salary}`

---

## 安装（Chrome + 篡改猴）

### 1. 安装篡改猴

1. 打开 Chrome 网上应用店  
2. 搜索并安装 **Tampermonkey**（篡改猴）  
3. 安装后确认扩展已启用

Chrome 应用店：[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)

### 2. 安装本脚本

任选一种方式：

#### 方式 A：从 GitHub 一键安装（推荐）

仓库推送成功后，用篡改猴打开下方 Raw 地址即可安装：

安装链接（点击后由篡改猴接管）：

https://raw.githubusercontent.com/songjingyang/boss-zhipin-auto-greet/main/boss-zhipin-auto-greet.user.js

也可在仓库页打开 `boss-zhipin-auto-greet.user.js` → 点 `Raw`，由篡改猴提示安装。

#### 方式 B：手动粘贴

1. 点击浏览器工具栏的 **篡改猴** 图标 → **添加新脚本**  
2. 删除编辑器里的默认模板  
3. 将本仓库中的 [`boss-zhipin-auto-greet.user.js`](./boss-zhipin-auto-greet.user.js) 全文粘贴进去  
4. 按 `Ctrl + S`（macOS：`Cmd + S`）保存

### 3. 允许在招聘站点运行

首次打开招聘页时，若篡改猴提示权限，请允许在以下站点运行：

- `https://www.zhipin.com/*`
- `https://we.51job.com/*`

---

## 使用方法

### Boss 直聘

1. 登录 [Boss 直聘](https://www.zhipin.com/)  
2. 打开职位列表 / 推荐页，例如：  
   - `https://www.zhipin.com/web/geek/job`  
   - `https://www.zhipin.com/web/geek/job-recommend`  
3. 页面右下角出现「👋 打招呼」按钮 → 打开面板  
4. 建议先点 **深度搜岗**，再点 **开始**  
5. 需要 VIP 追聊时，勾选「VIP 自动追聊」

提示：

- 刷不到岗位时，可关闭 Boss「个性化推荐」：我的 → 设置 → 个性化推荐  
- 间隔建议 ≥ 8 秒；可设置本次处理上限和预拉取页数，降低风控风险

### 前程无忧

1. 登录 [前程无忧](https://we.51job.com/)  
2. 进入搜索结果页并滚动加载职位  
3. 右下角打开面板 → **开始**  
4. 可选：勾选国企 / 央企 / 外企等公司性质筛选

---

## 面板主要配置

| 配置项 | 说明 |
|--------|------|
| 招呼语 / 附言 | 支持 `{jobName}` `{company}` `{salary}` |
| 薪资区间 (k) | 同时设置最低值和最高值；最高值为 `0` 表示不限 |
| 本次上限 | 本轮最多处理条数 |
| 预拉取页数 | 启动时拉取的搜索页数；`0` 表示不限 |
| 自动翻页 | 当前页处理完成后继续加载下一页 |
| 间隔秒数 | 两次操作之间的随机等待 |
| 黑名单 | 匹配岗位名 / 公司名，逗号分隔 |
| 白名单 | 仅匹配岗位名；留空不限制 |
| 排除外包 | 内置常见外包公司名单 |
| 跳过不活跃 | 跳过不活跃职位 / HR |
| 跳过已处理 | 跳过已打招呼 / 已投递记录 |
| 多关键词/多城市搜岗（Boss） | 按关键词和城市轮询拉取，缓解推荐页枯竭；城市支持名称或 9 位城市代码 |
| VIP 自动追聊（Boss） | 打招呼后尝试开启自动追聊（需会员） |
| 商圈/地铁线路代码（Boss，可选） | 比城市代码更细的地理筛选，弥补 PC 端无法像 App 端用 GPS 定位「附近职位」的差距；需在网页手动选好商圈/地铁后，从地址栏 URL 复制 `multiBusinessDistrict` / `multiSubway` 参数值填入 |
| 手动添加职位（Boss） | 粘贴在 App 上看到、PC 端搜不到的职位链接（详情页完整 URL）或 encryptJobId，加入本次打招呼队列，作为 PC/App 桥接 |

### 关于 PC 网页版与 App 刷到的岗位不一致

Boss 是"移动原生"设计，App 端用 GPS 精确定位、更看重实时行为信号，PC 网页版走的是相对独立的搜索链路，两端召回的职位集合本身就不完全一致，这是平台产品策略差异，并非脚本缺陷。脚本无法读取或修改 Boss 后端的推荐算法，也不会通过抓包 App 私有接口去"同步"两端数据；上面两个功能是在合规范围内尽量弥合差距的折中方案。

---

## 文件说明

```text
boss-zhipin-auto-greet/
├── boss-zhipin-auto-greet.user.js       # 篡改猴脚本本体
├── boss-zhipin-anti-antidebug.user.js   # 可选：反调试保护绕过（仅用于自行排查网络请求）
└── README.md                            # 本说明
```

## 更新日志

### v2.16.2

- 增加多城市搜索、自动翻页和可选的搜索页数/处理数量上限
- 将薪资筛选改为最低值与最高值区间配置
- 增强职位采集、手动添加职位和网络请求诊断能力
- 保留 Boss VIP 自动追聊与前程无忧公司性质筛选

## 附：DevTools 打开就自动关闭标签页

Boss 直聘对调试工具做了反调试保护，常见现象是打开 F12 后标签页直接被关闭（真实调用了 `window.close()`）。排查/使用网络请求功能时，可按需安装 [`boss-zhipin-anti-antidebug.user.js`](./boss-zhipin-anti-antidebug.user.js)（同样通过篡改猴安装），它在页面最早阶段拦截 `window.close`，并附带瓦解 `debugger` 轮询、console 格式化陷阱、窗口尺寸差检测等几种常见反调试手法。

先尝试 Chrome 自带的零风险方案，通常已经够用：

1. DevTools → Sources 面板 → 点击 **Deactivate breakpoints**（`⌘F8` / `Ctrl+F8`），让所有 `debugger;` 语句失效
2. DevTools 右上角 → Dock side → 弹出为独立窗口（undock），避免窗口尺寸差检测

只有这两步不够时才需要装反调试脚本。这是一个持续的攻防过程，不保证 100% 有效，仅用于个人自查自己账号的网络请求，不建议用于其他用途。

---

## 兼容性

- 浏览器：Google Chrome（推荐）  
- 扩展：Tampermonkey  
- 站点：Boss 直聘求职端、前程无忧 PC 搜索页  

页面结构变更可能导致脚本失效，届时需更新脚本版本。

---

## 免责声明

本项目为个人学习与求职辅助工具，与 Boss 直聘、前程无忧官方无关。使用自动化脚本可能违反平台用户协议，也可能触发账号风控。请合理使用，作者不对任何后果负责。

---

## License

MIT
