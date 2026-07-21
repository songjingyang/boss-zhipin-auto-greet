# 招聘自动打招呼助手（Boss 直聘 / 前程无忧）

Chrome + [篡改猴（Tampermonkey）](https://www.tampermonkey.net/) 用户脚本。

在 Boss 直聘自动打招呼（可选 VIP 自动追聊），在前程无忧自动投递简历。当前版本：**v2.6.1**

> 仅供个人求职效率提升使用。请控制频率，遵守平台规则，风险自负。

---

## 功能概览

| 平台 | 能力 |
|------|------|
| **Boss 直聘** | 自动打招呼、多关键词深度搜岗、薪资/黑白名单过滤、排除外包、跳过已打招呼、VIP 自动追聊 |
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
- 间隔建议 ≥ 8 秒，单次上限建议 ≤ 15，降低风控风险

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
| 最低薪资 (k) | 过滤过低薪资 |
| 最高薪资下限 (k) | 排除最高薪低于该值的岗位；`0` 表示不限 |
| 本次上限 | 本轮最多处理条数 |
| 预拉取页数 | 启动时拉取的搜索页数 |
| 间隔秒数 | 两次操作之间的随机等待 |
| 黑名单 | 匹配岗位名 / 公司名，逗号分隔 |
| 白名单 | 仅匹配岗位名；留空不限制 |
| 排除外包 | 内置常见外包公司名单 |
| 跳过不活跃 | 跳过不活跃职位 / HR |
| 跳过已处理 | 跳过已打招呼 / 已投递记录 |
| 多关键词搜岗（Boss） | 按关键词轮询拉取，缓解推荐页枯竭 |
| VIP 自动追聊（Boss） | 打招呼后尝试开启自动追聊（需会员） |

---

## 文件说明

```text
boss-zhipin-auto-greet/
├── boss-zhipin-auto-greet.user.js   # 篡改猴脚本本体
└── README.md                        # 本说明
```

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
