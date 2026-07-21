// ==UserScript==
// @name         招聘自动打招呼助手（Boss直聘 / 前程无忧）
// @namespace    https://github.com/songjingyang/boss-zhipin-auto-greet
// @version      2.7.0
// @description  Boss 直聘自动打招呼 + VIP 自动追聊 + 前程无忧自动投递
// @author       宋璟阳
// @match        https://www.zhipin.com/web/geek/*
// @match        https://www.zhipin.com/web/geek/job*
// @match        https://www.zhipin.com/web/geek/jobs*
// @match        https://www.zhipin.com/web/geek/job-recommend*
// @match        https://we.51job.com/*
// @icon         https://www.zhipin.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "2.7.0";

  /** Boss 城市代码（逗号分隔多城市搜岗） */
  const BOSS_CITY_PRESETS = {
    北京: "101010100",
    上海: "101020100",
    广州: "101280100",
    深圳: "101280600",
    杭州: "101210100",
    成都: "101270100",
    郑州: "101180100",
    全国: "100010000",
  };

  /** @returns {'boss' | 'job51' | null} */
  function detectPlatform() {
    const host = location.hostname;
    if (host.includes("zhipin.com")) return "boss";
    if (host.includes("51job.com")) return "job51";
    return null;
  }

  const platform = detectPlatform();
  if (!platform) return;

  const PLATFORM_META = {
    boss: {
      id: "boss",
      label: "Boss 直聘",
      shortLabel: "Boss",
      theme: "#00bebd",
      actionVerb: "打招呼",
      storagePrefix: "boss_auto_greet",
      dataAttr: "data-boss-auto-greet",
    },
    job51: {
      id: "job51",
      label: "前程无忧",
      shortLabel: "51job",
      theme: "#ff6000",
      actionVerb: "投递",
      storagePrefix: "job51_auto_greet",
      dataAttr: "data-job51-auto-greet",
    },
  };

  const meta = PLATFORM_META[platform];
  const STORAGE_KEY = `${meta.storagePrefix}_config_v1`;
  const GREETED_KEY = `${meta.storagePrefix}_greeted_jobs_v1`;

  const DEFAULT_CONFIG = {
    greeting:
      "您好，我是宋璟阳，8年前端开发经验，熟悉 React/Vue 双栈及中后台、跨端小程序开发。看到贵司「{jobName}」岗位与我的背景较匹配，方便进一步沟通吗？",
    minSalary: 12,
    minMaxSalary: 15,
    maxCount: 15,
    maxFetchPages: 5,
    delayMin: 8,
    delayMax: 15,
    blacklist:
      "猎头,外包,驻场,信息安全,销售,后端开发,Java开发,Python开发,测试工程师,运维工程师,产品经理,UI设计师,Android开发,iOS开发,嵌入式开发,算法工程师,Go开发,PHP开发,.NET开发,大数据开发,区块链开发",
    whitelist: "前端,Web前端,前端开发,前端工程师,H5,小程序,React,Vue,vue",
    skipInactive: true,
    skipGreeted: true,
    excludeOutsourcing: false,
    // Boss 多关键词搜岗：突破推荐页岗位枯竭
    searchKeywords: "前端开发,前端工程师,Web前端,Vue,React,小程序,H5,大前端",
    searchCities: "101010100",
    multiKeywordSearch: true,
    pagesPerKeyword: 3,
    // Boss VIP：打招呼后自动开启追聊（需会员）
    bossAutoFollowChat: true,
    // 前程无忧：公司性质白名单（都不勾选则不限）
    job51FilterGuoqi: false,
    job51FilterYangqi: false,
    job51FilterWaiqi: false,
  };

  const OUTSOURCING_COMPANIES = [
    "中软国际",
    "文思海辉",
    "软通动力",
    "东软集团",
    "东软",
    "法本信息",
    "博彦科技",
    "亚信科技",
    "海隆软件",
    "微创软件",
    "诚迈科技",
    "凌志软件",
    "润和软件",
    "亿达信息",
    "新致软件",
    "慧博云通",
    "拓保软件",
    "中科软",
    "中电金信",
    "中电软件",
    "佰钧成",
    "博道信息",
    "华胜天成",
    "神州信息",
    "埃森哲",
    "accenture",
    "凯捷",
    "capgemini",
    "高知特",
    "cognizant",
    "印孚瑟斯",
    "infosys",
    "塔塔咨询",
    "tcs",
    "hcl",
    "德科",
    "外企德科",
    "万宝盛华",
    "人瑞人才",
    "科锐国际",
    "fesco",
    "任仕达",
    "randstad",
    "中智",
    "外服",
    "上海外服",
  ];

  const OUTSOURCING_NAME_KEYWORDS = [
    "外包",
    "人力外包",
    "人才外包",
    "项目外包",
    "劳务派遣",
    "人才派遣",
    "人力派遣",
    "驻场外包",
  ];

  const state = {
    running: false,
    index: 0,
    success: 0,
    skip: 0,
    fail: 0,
    jobs: [],
  };

  let capturedJobs = [];
  /** Boss 搜索 API 触发风控后停用主动拉取，改从页面 DOM 采集；冷却期后自动重试，避免一次误判永久失效 */
  let bossEnvBlocked = false;
  let bossEnvBlockedAt = 0;
  const BOSS_ENV_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
  const OLD_DEFAULT_BLACKLIST = "猎头,外包,驻场,信息安全,销售";

  // ---------- 通用工具 ----------

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const cfg = { ...DEFAULT_CONFIG, ...saved };
      if (!("whitelist" in saved)) cfg.whitelist = DEFAULT_CONFIG.whitelist;
      if (
        !("blacklist" in saved) ||
        saved.blacklist === OLD_DEFAULT_BLACKLIST
      ) {
        cfg.blacklist = DEFAULT_CONFIG.blacklist;
      }
      // v2.2 新增搜岗配置：老用户自动补齐
      [
        "searchKeywords",
        "searchCities",
        "multiKeywordSearch",
        "pagesPerKeyword",
        "bossAutoFollowChat",
      ].forEach((key) => {
        if (!(key in saved)) cfg[key] = DEFAULT_CONFIG[key];
      });
      return cfg;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function loadGreetedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(GREETED_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveGreetedSet(set) {
    localStorage.setItem(GREETED_KEY, JSON.stringify([...set]));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelay(minSec, maxSec) {
    const min = Math.min(minSec, maxSec) * 1000;
    const max = Math.max(minSec, maxSec) * 1000;
    return sleep(min + Math.random() * (max - min));
  }

  function splitKeywords(str) {
    return String(str || "")
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function jobNameMatchesAny(jobName, keywords) {
    if (!keywords.length) return false;
    const name = String(jobName || "").toLowerCase();
    return keywords.some((w) => name.includes(w.toLowerCase()));
  }

  function isOutsourcingCompany(brandName) {
    if (!brandName) return false;
    const name = String(brandName).trim();
    const lower = name.toLowerCase();
    if (OUTSOURCING_COMPANIES.some((c) => lower.includes(c.toLowerCase())))
      return true;
    if (OUTSOURCING_NAME_KEYWORDS.some((k) => name.includes(k))) return true;
    return false;
  }

  function getMountRoot() {
    return document.body || document.documentElement;
  }

  function formatGreeting(template, job) {
    return template
      .replace(/\{jobName\}/g, job.jobName || "")
      .replace(/\{company\}/g, job.brandName || "")
      .replace(/\{salary\}/g, job.salaryDesc || "")
      .replace(/\\n/g, "\n");
  }

  /**
   * 将薪资片段统一换算为 k（千元/月）
   * 兼容 Boss：15-25K、15K-25K、20~35K·13薪
   * 兼容 51job：1.5-2万、5千-1万、18000-25000、18k、1.8万
   */
  function partToK(num, unit, inheritUnit) {
    if (!num || num <= 0) return 0;
    const u = unit || inheritUnit || "";
    if (/万/.test(u)) return num * 10;
    if (/千/.test(u)) return num;
    if (/[Kk]/.test(u)) return num;
    // 纯数字：>=1000 视为元/月（如 18000），否则视为 k（如 18）
    if (num >= 1000) return num / 1000;
    return num;
  }

  function parseSalaryRange(salaryDesc) {
    if (!salaryDesc || /面议|不限/.test(String(salaryDesc))) {
      return { min: 0, max: 0 };
    }

    const raw = String(salaryDesc);
    const isAnnual = /\/年|年薪|每年|\/annum/i.test(raw);
    let s = raw
      .replace(/·\d+薪/g, "")
      .replace(/\([^\)]*\)/g, "")
      .replace(/\/月|\/年|\/季|\/annum/gi, "")
      .replace(/[,，]/g, "")
      .replace(/元/g, "")
      .trim();

    // 区间：1.5-2万 / 5千-1万 / 18-25K / 18000-25000 / 8千-1.5万
    const rangeMatch = s.match(
      /^([\d.]+)\s*(万|千|[Kk])?\s*[-~～至到]+\s*([\d.]+)\s*(万|千|[Kk])?\s*$/,
    );
    if (rangeMatch) {
      const n1 = parseFloat(rangeMatch[1]);
      const u1 = rangeMatch[2] || "";
      const n2 = parseFloat(rangeMatch[3]);
      const u2 = rangeMatch[4] || "";
      const inherit = u2 || u1;
      let min = partToK(n1, u1, inherit);
      let max = partToK(n2, u2, inherit);
      if (isAnnual) {
        min = min > 0 ? min / 12 : 0;
        max = max > 0 ? max / 12 : 0;
      }
      return { min, max };
    }

    // 单值：1.8万 / 18k / 18000
    const singleMatch = s.match(/^([\d.]+)\s*(万|千|[Kk])?\s*$/);
    if (singleMatch) {
      let min = partToK(
        parseFloat(singleMatch[1]),
        singleMatch[2],
        singleMatch[2],
      );
      if (isAnnual && min > 0) min /= 12;
      return { min, max: 0 };
    }

    // 兜底：从字符串中提取数字，继承全局单位
    const nums = s.match(/[\d.]+/g);
    if (!nums?.length) return { min: 0, max: 0 };
    const globalUnit = /万/.test(s)
      ? "万"
      : /千/.test(s)
        ? "千"
        : /[Kk]/.test(s)
          ? "K"
          : "";
    let min = partToK(parseFloat(nums[0]), globalUnit, globalUnit);
    let max =
      nums.length >= 2
        ? partToK(parseFloat(nums[1]), globalUnit, globalUnit)
        : 0;
    if (isAnnual) {
      if (min > 0) min /= 12;
      if (max > 0) max /= 12;
    }
    return { min, max };
  }

  function parseSalaryMin(salaryDesc) {
    return parseSalaryRange(salaryDesc).min;
  }

  function parseSalaryMax(salaryDesc) {
    return parseSalaryRange(salaryDesc).max;
  }

  function jobKey(job) {
    return (
      job.encryptJobId ||
      job.encryptId ||
      job.jobId ||
      `${job.securityId || ""}_${job.jobName || ""}`
    );
  }

  /**
   * 合并两条同一职位记录：优先以「带 securityId 的干净数据」为主，
   * 另一份仅用于补齐缺失字段。避免 DOM 解析出的残缺数据（缺 securityId、
   * 薪资被反爬字体处理成「-K·薪」）覆盖接口/Vue 抓到的完整数据。
   */
  function mergeJobEntry(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const existingHasSid = !!existing.securityId;
    const incomingHasSid = !!incoming.securityId;
    // 主记录：谁有 securityId 用谁；都有或都没有时以新数据为主
    const [primary, secondary] =
      existingHasSid && !incomingHasSid
        ? [existing, incoming]
        : [incoming, existing];
    const merged = { ...secondary };
    Object.entries(primary).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") merged[k] = v;
    });
    return merged;
  }

  /** 以 jobKey 去重并按字段择优合并到 map */
  function upsertJob(map, job) {
    const key = jobKey(job);
    if (!key) return;
    map.set(key, map.has(key) ? mergeJobEntry(map.get(key), job) : job);
  }

  function showToast(msg, type = "success", duration = 6000) {
    const colors = {
      success: meta.theme,
      error: "#ff4d4f",
      warn: "#faad14",
      info: "#1677ff",
    };
    let toast = document.getElementById("bag-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "bag-toast";
      Object.assign(toast.style, {
        position: "fixed",
        left: "50%",
        bottom: "32px",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        padding: "12px 20px",
        borderRadius: "8px",
        color: "#fff",
        fontSize: "14px",
        fontWeight: "600",
        boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        maxWidth: "90vw",
        textAlign: "center",
        pointerEvents: "none",
        transition: "opacity .3s",
      });
      getMountRoot().appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = colors[type] || colors.info;
    toast.style.opacity = "1";
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.style.opacity = "0";
    }, duration);
  }

  function log(msg, type = "info") {
    const el = document.getElementById("bag-log");
    if (el) {
      const line = document.createElement("div");
      line.className = `bag-log-line bag-log-${type}`;
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      el.prepend(line);
      while (el.children.length > 80) el.removeChild(el.lastChild);
    }
  }

  function updateStats() {
    const el = document.getElementById("bag-stats");
    if (el) {
      el.textContent = `进度 ${state.index}/${state.jobs.length} | 成功 ${state.success} | 跳过 ${state.skip} | 失败 ${state.fail}`;
    }
  }

  function normalizeJob51Item(item) {
    if (!item || typeof item !== "object") return null;
    const jobId = String(item.jobId || item.jobid || "");
    if (!jobId) return null;
    const labelList =
      item.companyLabelList || item.companyLabels || item.labelList || [];
    const companyLabels = Array.isArray(labelList)
      ? labelList
          .map((x) =>
            typeof x === "string" ? x : x?.labelName || x?.name || "",
          )
          .filter(Boolean)
      : [];
    return {
      jobId,
      encryptJobId: jobId,
      encryptId: jobId,
      jobName: item.jobName || item.jobTitle || "",
      salaryDesc: item.provideSalaryString || item.salary || "",
      brandName: item.companyName || item.fullCompanyName || "",
      companyTypeString: item.companyTypeString || item.companyTypeStr || "",
      companyType: String(item.companyType || item.comType || ""),
      companyLabels,
      jobHref: item.jobHref || item.jobUrl || "",
      encCoId: item.encCoId || "",
      isApplied:
        item.isApply === "1" || item.isApply === 1 || item.isApply === true,
      updateTime:
        item.updateDateTime || item.issueDateString || item.jobTime || "",
      pageNum: item.pageNum || 0,
      _platform: "job51",
    };
  }

  /** 从 DOM 卡片提取公司性质文本 */
  function extractJob51CompanyTypeFromCard(card) {
    if (!card) return "";
    const selectors = [
      ".c_type",
      ".ctype",
      ".com_type",
      ".dc",
      ".tag",
      ".tags",
      ".info",
    ];
    for (const sel of selectors) {
      const text = card.querySelector(sel)?.textContent?.trim();
      if (text && /国企|央企|外资|外企|合资|民营|上市|事业|机关/.test(text))
        return text;
    }
    return "";
  }

  /** 判断是否为央企（51job 常标为国企，需结合名称/标签识别） */
  function isJob51Yangqi(job) {
    const name = job.brandName || "";
    const labels = (job.companyLabels || []).join(" ");
    const combined = `${labels} ${name} ${job.companyTypeString || ""}`;
    if (/央企/.test(combined)) return true;
    // 常见央企命名：中国XX集团/公司
    if (/^中国[\u4e00-\u9fa5]{2,12}集团/.test(name)) return true;
    return false;
  }

  /** 判断是否为国企（含央企） */
  function isJob51Guoqi(job) {
    if (isJob51Yangqi(job)) return true;
    const typeStr = job.companyTypeString || "";
    const typeCode = String(job.companyType || "");
    const labels = (job.companyLabels || []).join(" ");
    if (typeCode === "02" || /国企|国营/.test(`${typeStr} ${labels}`))
      return true;
    return false;
  }

  /** 判断是否为外企/外资 */
  function isJob51Waiqi(job) {
    const typeStr = job.companyTypeString || "";
    const typeCode = String(job.companyType || "");
    const labels = (job.companyLabels || []).join(" ");
    const combined = `${typeStr} ${labels}`;
    if (typeCode === "04" || /外资|外企|外商|欧美/.test(combined)) return true;
    return false;
  }

  /** 前程无忧公司性质筛选，返回跳过原因或 null */
  function checkJob51CompanyTypeFilter(job, cfg) {
    const wantGuoqi = !!cfg.job51FilterGuoqi;
    const wantYangqi = !!cfg.job51FilterYangqi;
    const wantWaiqi = !!cfg.job51FilterWaiqi;
    if (!wantGuoqi && !wantYangqi && !wantWaiqi) return null;

    const matched =
      (wantGuoqi && isJob51Guoqi(job)) ||
      (wantYangqi && isJob51Yangqi(job)) ||
      (wantWaiqi && isJob51Waiqi(job));

    if (matched) return null;

    const wanted = [
      wantGuoqi && "国企",
      wantYangqi && "央企",
      wantWaiqi && "外企",
    ].filter(Boolean);
    const actual = job.companyTypeString || "未知";
    return `公司性质不匹配（${actual}，需 ${wanted.join("/")}）`;
  }

  function ingestJobList(list, source) {
    if (!Array.isArray(list) || !list.length) return 0;
    const normalized =
      platform === "job51"
        ? list.map(normalizeJob51Item).filter(Boolean)
        : list;
    const map = new Map();
    [...capturedJobs, ...normalized].forEach((job) => upsertJob(map, job));
    capturedJobs = [...map.values()];
    log(
      `从${source}获取 ${normalized.length} 个职位（累计 ${capturedJobs.length}）`,
      "info",
    );
    return normalized.length;
  }

  // ---------- Boss 专用 ----------

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function getBossToken() {
    return getCookie("bst") || window._PAGE?.token || "";
  }

  /** 较严重的环境/账户风控：需要暂停主动请求，切到页面采集 */
  function isBossEnvError(message) {
    return /环境存在异常|环境异常|账户存在异常|异常行为|code[=:]?\s*36/i.test(
      String(message || ""),
    );
  }

  /** 单纯的频率限制：退避重试即可，不必永久切换模式 */
  function isBossRateLimitError(message) {
    return /频繁|繁忙|稍后再试|请求过多|限流|太快/i.test(String(message || ""));
  }

  function markBossEnvBlocked(reason) {
    bossEnvBlocked = true;
    bossEnvBlockedAt = Date.now();
    log(
      `Boss 搜索 API 已停用（${reason}），改从页面 DOM / Vue 缓存采集职位，${Math.round(BOSS_ENV_BLOCK_COOLDOWN_MS / 60000)} 分钟后自动重试接口`,
      "warn",
    );
    showToast("检测到环境风控，已切换为页面采集模式", "warn", 6000);
  }

  function buildBossSearchReferer(overrides = {}, page = 1) {
    const params = buildBossSearchApiParams(page, overrides);
    return `${location.origin}/web/geek/jobs?${params.toString()}`;
  }

  function buildBossApiHeaders(overrides = {}, page = 1, referer) {
    const token = getBossToken();
    const headers = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: referer || buildBossSearchReferer(overrides, page),
    };
    if (token) headers.Zp_token = token;
    return headers;
  }

  /** 使用页面原生 XHR 发请求，携带完整 headers，降低风控误判 */
  function bossApiRequest(
    method,
    path,
    { headers = {}, body = null, overrides = {}, page = 1, referer } = {},
  ) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = path.startsWith("/")
        ? path
        : path.replace(/^https:\/\/www\.zhipin\.com/, "");
      xhr.open(method, url, true);
      xhr.withCredentials = true;
      const merged = {
        ...buildBossApiHeaders(overrides, page, referer),
        ...headers,
      };
      Object.entries(merged).forEach(([k, v]) => {
        if (v != null && v !== "") xhr.setRequestHeader(k, v);
      });
      xhr.onload = () => {
        let data;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          reject(new Error(`响应解析失败 HTTP ${xhr.status}`));
          return;
        }
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data,
        });
      };
      xhr.onerror = () => reject(new Error("网络请求失败"));
      xhr.send(body);
    });
  }

  function extractBossJobsFromApiData(data) {
    if (!data || typeof data !== "object") return [];
    const zp = data.zpData || data.data?.zpData || data;
    return zp?.jobList || zp?.list || zp?.jobs || data?.jobList || [];
  }

  function parseBossJobsFromDOM() {
    // 除精确 class 外，额外加入 [class*=] / [data-*] 模糊匹配，降低 Boss 前端改版（class 哈希化等）导致选择器失效的概率
    const selectors = [
      ".job-card-wrapper",
      "li.job-card-wrapper",
      ".job-list-box li",
      ".rec-job-list li",
      '[class*="job-card"]',
      '[class*="job-list"] li',
      "[data-jobid]",
      "[data-encryptjobid]",
    ];
    const jobs = [];
    const seen = new Set();
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((card) => {
        collectBossJobFromCard(card, jobs, seen);
      });
    });
    document.querySelectorAll('a[href*="job_detail"]').forEach((linkEl) => {
      collectBossJobFromLink(
        linkEl,
        linkEl.closest("li") || linkEl,
        jobs,
        seen,
      );
    });
    if (!jobs.length) {
      // 页面文案里能找到「12-18K」之类薪资格式，但一个职位都没采到 → 大概率是选择器过期而非真的没岗位
      const hasSalaryText = /\d+\s*[-~]\s*\d+\s*[Kk]/.test(
        document.body?.innerText || "",
      );
      if (hasSalaryText) {
        log(
          "页面疑似存在职位卡片，但当前选择器未命中（可能是 Boss 页面结构已更新），请反馈运行日志给脚本作者",
          "warn",
        );
      }
    }
    return jobs;
  }

  function collectBossJobFromLink(linkEl, card, jobs, seen) {
    const href = linkEl?.href || linkEl?.getAttribute("href") || "";
    if (!href.includes("job_detail")) return;
    let encryptJobId = "";
    let securityId = "";
    let lid = "";
    try {
      const url = new URL(href, location.origin);
      encryptJobId = url.pathname.match(/job_detail\/([^/?#]+)/)?.[1] || "";
      securityId = url.searchParams.get("securityId") || "";
      lid = url.searchParams.get("lid") || "";
    } catch {
      return;
    }
    // securityId 兜底：部分卡片不在 URL 上，而放在 li/a 的 data 属性里
    if (!securityId) {
      const sidHost = card || linkEl;
      securityId =
        sidHost?.getAttribute?.("data-securityid") ||
        sidHost?.getAttribute?.("data-securityId") ||
        linkEl?.getAttribute?.("data-securityid") ||
        sidHost?.querySelector?.("[data-securityid]")?.getAttribute(
          "data-securityid",
        ) ||
        "";
    }
    if (!encryptJobId && !securityId) return;
    const dedupeKey = `${encryptJobId}_${securityId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const root = card || linkEl;
    jobs.push({
      encryptJobId,
      encryptId: encryptJobId,
      securityId,
      lid,
      jobName:
        root.querySelector?.(".job-name, .job-title")?.textContent?.trim() ||
        linkEl.textContent?.trim() ||
        "",
      salaryDesc:
        root.querySelector?.(".salary, .job-salary")?.textContent?.trim() || "",
      brandName:
        root
          .querySelector?.(".company-name, .company-text")
          ?.textContent?.trim() || "",
    });
  }

  function collectBossJobFromCard(card, jobs, seen) {
    const linkEl = card.querySelector(
      'a[href*="job_detail"], a.job-card-left, .job-card-left a, a[ka*="job"]',
    );
    if (linkEl) collectBossJobFromLink(linkEl, card, jobs, seen);
  }

  function getBossVueJobList() {
    const selectors = [
      ".job-recommend-main",
      ".jobs-search-page",
      ".job-search-wrapper",
      ".job-list-box",
      "#wrap",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      let cur = el.__vue__;
      for (let i = 0; i < 10 && cur; i++) {
        if (Array.isArray(cur.jobList) && cur.jobList.length)
          return cur.jobList;
        if (Array.isArray(cur.jobCardList) && cur.jobCardList.length)
          return cur.jobCardList;
        if (cur.$data?.jobList?.length) return cur.$data.jobList;
        cur = cur.$parent || cur.parent;
      }
      cur = el.__vueParentComponent?.ctx || el.__vueParentComponent?.setupState;
      for (let i = 0; i < 10 && cur; i++) {
        if (Array.isArray(cur.jobList) && cur.jobList.length)
          return cur.jobList;
        if (Array.isArray(cur.jobCardList) && cur.jobCardList.length)
          return cur.jobCardList;
        cur = cur.$parent;
      }
    }
    return null;
  }

  function buildBossSearchApiParams(page = 1, overrides = {}) {
    const qs = new URLSearchParams(location.search);
    const apiParams = new URLSearchParams();
    [
      "query",
      "city",
      "position",
      "experience",
      "degree",
      "salary",
      "scale",
      "jobType",
    ].forEach((key) => {
      const val = overrides[key] !== undefined ? overrides[key] : qs.get(key);
      if (val) apiParams.set(key, val);
    });
    if (!apiParams.has("city")) {
      apiParams.set("city", overrides.city || "101010100");
    }
    if (!apiParams.has("scene")) apiParams.set("scene", "1");
    apiParams.set("pageSize", "30");
    apiParams.set("page", String(page));
    return apiParams;
  }

  function resolveBossCityCodes(cityStr) {
    const parts = splitKeywords(cityStr || "101010100");
    return parts.map((p) => BOSS_CITY_PRESETS[p] || p);
  }

  function getBossCityLabel(code) {
    const entry = Object.entries(BOSS_CITY_PRESETS).find(([, v]) => v === code);
    return entry ? entry[0] : code;
  }

  async function fetchBossJobsFromSearchApi(page = 1, overrides = {}) {
    if (bossEnvBlocked) {
      if (Date.now() - bossEnvBlockedAt < BOSS_ENV_BLOCK_COOLDOWN_MS) {
        return { list: [], hasMore: false, envBlocked: true };
      }
      log("风控冷却期已过，重新尝试调用搜索接口…", "info");
      bossEnvBlocked = false;
    }
    const token = getBossToken();
    if (!token) return { list: [], hasMore: false };
    const label = overrides.query ? `「${overrides.query}」` : "";
    const path = `/wapi/zpgeek/search/joblist.json?${buildBossSearchApiParams(page, overrides).toString()}`;
    try {
      const { data } = await bossApiRequest("GET", path, { overrides, page });
      if (!data || data.code !== 0) {
        const msg = data?.message || String(data?.code ?? "unknown");
        if (isBossEnvError(msg)) {
          markBossEnvBlocked(msg);
        } else if (isBossRateLimitError(msg)) {
          log(`搜索${label} p${page} 触发限流：${msg}，稍后重试`, "warn");
        } else {
          log(`搜索${label} p${page}: ${msg}`, "warn");
        }
        return { list: [], hasMore: false, envBlocked: bossEnvBlocked };
      }
      const list = extractBossJobsFromApiData(data);
      if (list.length) ingestJobList(list, `搜索${label} p${page}`);
      const pageInfo = data?.zpData?.page || data?.data?.zpData?.page || {};
      const total = pageInfo.total || pageInfo.totalCount || 0;
      const pageSize = pageInfo.pageSize || list.length || 30;
      const hasMore =
        total > 0 ? page * pageSize < total : list.length >= pageSize;
      return { list, hasMore };
    } catch (err) {
      log(`搜索接口 p${page} 请求失败: ${err.message}`, "warn");
      return { list: [], hasMore: false };
    }
  }

  /** 风控模式下从当前页面 DOM / Vue 采集职位 */
  async function collectBossJobsFromPageOnly(sourceLabel) {
    await autoScrollJobList(2);
    const domJobs = parseBossJobsFromDOM();
    const vueJobs = getBossVueJobList() || [];
    const combined = [...domJobs, ...vueJobs];
    if (combined.length) ingestJobList(combined, sourceLabel);
    return combined;
  }

  /**
   * 查找「下一页 / 换一批 / 查看更多」类按钮。
   * 推荐页(job-recommend)通常没有传统分页，而是无限滚动 + 换一批按钮；
   * 用文本关键词匹配代替死记 class，更抗前端改版。
   */
  function findLoadMoreOrNextButton() {
    const keywordRe = /下一页|下页|换一批|查看更多|加载更多|更多职位|猜你喜欢/;
    const candidates = document.querySelectorAll(
      'button, a, [role="button"], .ui-icon-arrow-right, [class*="next"], [class*="more"]',
    );
    for (const el of candidates) {
      if (el.closest(".disabled, [disabled]") || el.disabled) continue;
      if (!isVisibleEl(el)) continue;
      const text = (el.textContent || "").trim();
      if (keywordRe.test(text) || /next/i.test(el.className || "")) {
        return el;
      }
    }
    return null;
  }

  /** 风控/兜底模式下采集当前页职位：优先滚动加载，滚动无新增再尝试点击「下一页/换一批」 */
  async function fetchBossJobsViaPagePagination(maxPages = 3) {
    log("页面采集模式：从当前页 DOM 读取并尝试滚动/翻页加载更多", "info");
    let lastCount = (await collectBossJobsFromPageOnly("当前页")).length;
    for (let round = 1; round <= maxPages; round++) {
      await autoScrollJobList(2);
      await sleep(1000);
      const jobs = await collectBossJobsFromPageOnly(`滚动第${round}轮`);
      if (jobs.length > lastCount) {
        log(`滚动加载：新增 ${jobs.length - lastCount} 个职位`, "info");
        lastCount = jobs.length;
        continue;
      }
      const moreBtn = findLoadMoreOrNextButton();
      if (!moreBtn) {
        log("滚动到底且未找到「下一页/换一批」按钮，页面采集结束", "warn");
        break;
      }
      log(`点击「${(moreBtn.textContent || "").trim().slice(0, 8)}」尝试加载更多…`, "info");
      safeClick(moreBtn);
      await sleep(2500);
    }
  }

  async function checkBossActive(job) {
    if (!job.securityId) return true;
    try {
      const fd = new FormData();
      fd.append("securityId", job.securityId);
      if (job.encryptBossId) fd.append("bossId", job.encryptBossId);
      const { data } = await bossApiRequest(
        "POST",
        "/wapi/zpgeek/job/detail.json",
        { body: fd, referer: location.href },
      );
      const activeDesc =
        data?.zpData?.bossInfo?.activeTimeDesc ||
        data?.zpData?.jobInfo?.activeTimeDesc ||
        "";
      if (["周", "月", "年"].some((t) => activeDesc.includes(t))) return false;
    } catch {
      /* 查询失败时不阻断 */
    }
    return true;
  }

  async function greetBossJob(job, cfg) {
    const token = getBossToken();
    if (!token) throw new Error("未获取到登录 token，请确认已登录");
    const securityId = job.securityId;
    const jobId = job.encryptJobId || job.encryptId;
    if (!securityId || !jobId) throw new Error("职位缺少 securityId 或 jobId");
    const params = new URLSearchParams({ securityId, jobId });
    if (job.lid) params.set("lid", job.lid);
    if (cfg.bossAutoFollowChat) params.set("openAutoChat", "1");
    const { data } = await bossApiRequest(
      "POST",
      `/wapi/zpgeek/friend/add.json?${params.toString()}`,
      { referer: location.href },
    );
    if (data.code !== 0) {
      if (isBossEnvError(data.message)) markBossEnvBlocked(data.message);
      throw new Error(data.message || `接口错误 code=${data.code}`);
    }
    if (cfg.greeting && data.zpData?.showGreeting) {
      await trySendBossCustomGreeting(cfg.greeting, job, cfg);
    }
    if (cfg.bossAutoFollowChat) {
      await tryEnableBossVipChatFeatures(job, data, cfg);
    }
    return data;
  }

  /** 在招呼弹窗中勾选「自动追聊」开关 */
  function tryEnableBossAutoFollowInDialog() {
    const dialog = document.querySelector(
      ".greet-boss-dialog, .greet-dialog, .dialog-container",
    );
    if (!dialog) return false;

    let enabled = false;
    const vue =
      dialog.__vue__ ||
      dialog.__vueParentComponent?.ctx ||
      dialog.__vueParentComponent?.setupState;
    if (vue) {
      const fields = [
        "openAutoChat",
        "autoChat",
        "isAutoChat",
        "autoFollowUp",
        "chaseChat",
        "showAutoChat",
        "autoChatSwitch",
        "autoFollowChat",
      ];
      for (const key of fields) {
        if (key in vue) {
          vue[key] = true;
          enabled = true;
        }
      }
    }

    dialog
      .querySelectorAll("label, .checkbox, .switch, span, div")
      .forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (!/追聊|自动追/.test(text)) return;
        const input =
          el.querySelector('input[type="checkbox"]') ||
          el.closest("label")?.querySelector('input[type="checkbox"]');
        if (input && !input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          enabled = true;
        }
      });
    return enabled;
  }

  /** 尝试通过 VIP 接口为单个会话开启自动追聊 */
  async function tryEnableBossAutoFollowViaApi(securityId) {
    const sid = encodeURIComponent(securityId);
    const candidates = [
      {
        path: "/wapi/zpitem/web/online/setAutoChat",
        body: `securityId=${sid}&source=12&`,
      },
      {
        path: "/wapi/zpitem/geek/autoChat/open.json",
        body: `securityId=${sid}&source=12&`,
      },
      {
        path: "/wapi/zpgeek/autochat/open.json",
        body: `securityId=${sid}&`,
      },
      {
        path: "/wapi/zpitem/web/geek/openAutoChat.json",
        body: `securityId=${sid}&source=12&`,
      },
    ];

    for (const item of candidates) {
      try {
        const { data } = await bossApiRequest("POST", item.path, {
          body: item.body,
          referer: "https://www.zhipin.com/web/geek/chat",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        if (data?.code !== 0) continue;
        const ok =
          data?.zpData?.autoChatResult ??
          data?.zpData?.openResult ??
          data?.zpData?.result ??
          data?.zpData?.success ??
          data?.message === "Success";
        if (ok === false) continue;
        return { ok: true, path: item.path, data };
      } catch {
        /* 尝试下一个候选接口 */
      }
    }
    return { ok: false };
  }

  /** 打招呼成功后触发 VIP 自动追聊（优先提醒功能已下线） */

  async function tryEnableBossVipChatFeatures(job, greetData, cfg) {
    if (!cfg.bossAutoFollowChat) return;
    const securityId = job.securityId || greetData?.zpData?.securityId || "";
    if (!securityId) return;

    const dialogEnabled = tryEnableBossAutoFollowInDialog();
    const apiResult = await tryEnableBossAutoFollowViaApi(securityId);
    if (dialogEnabled || apiResult.ok) {
      log(
        `已开启自动追聊：${job.brandName || ""} · ${job.jobName || ""}`,
        "success",
      );
    } else {
      log(
        `追聊接口未确认成功（已传 openAutoChat=1）：${job.brandName || ""} · ${job.jobName || ""}`,
        "warn",
      );
    }
  }

  async function trySendBossCustomGreeting(greetingTemplate, job, cfg) {
    await sleep(1500);
    const dialog = document.querySelector(".greet-boss-dialog");
    if (!dialog?.__vue__) return;
    try {
      if (cfg?.bossAutoFollowChat) tryEnableBossAutoFollowInDialog();
      const vue = dialog.__vue__;
      const text = formatGreeting(greetingTemplate, job);
      if ("greetContent" in vue) vue.greetContent = text;
      if ("content" in vue) vue.content = text;
      if ("message" in vue) vue.message = text;
      if (typeof vue.submitAction === "function") vue.submitAction();
      else if (typeof vue.confirmAction === "function") vue.confirmAction();
      await sleep(800);
      if (typeof vue.closeAction === "function") vue.closeAction();
    } catch {
      /* 弹窗结构变化时静默失败 */
    }
  }

  // ---------- 前程无忧专用 ----------

  function extractJob51FromApiData(data) {
    if (!data || typeof data !== "object") return [];
    const body = data.resultbody || data.data?.resultbody || data;
    return body?.job?.items || body?.items || [];
  }

  function parseJob51FromSensorsEl(el) {
    const raw =
      el.getAttribute("sensorsdata") ||
      el.getAttribute("sensorsData") ||
      el.getAttribute("sensorsname") ||
      el.getAttribute("sensorsName");
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const card =
        el.closest(".joblist-item, .joblist > div, .job_item, .joblist") || el;
      const rawType = data.companyTypeString || data.companyType || "";
      const typeIsCode = /^\d{2}$/.test(String(rawType));
      return normalizeJob51Item({
        jobId: data.jobId || data.jobid,
        jobName:
          data.jobTitle ||
          data.jobName ||
          card.querySelector?.(".jname, .jobname, .name")?.textContent?.trim(),
        provideSalaryString:
          data.jobSalary ||
          data.provideSalaryString ||
          card.querySelector?.(".sal, .salary")?.textContent?.trim(),
        companyName:
          data.companyName ||
          data.company ||
          card.querySelector?.(".cname, .company")?.textContent?.trim(),
        companyTypeString: typeIsCode
          ? extractJob51CompanyTypeFromCard(card)
          : rawType || extractJob51CompanyTypeFromCard(card),
        companyType: typeIsCode
          ? rawType
          : data.companyTypeCode || data.comType || "",
        companyLabelList: data.companyLabelList || data.companyLabels,
        jobHref: data.jobHref,
        isApply: data.isApply,
        updateDateTime: data.jobTime || data.updateDateTime,
      });
    } catch {
      return null;
    }
  }

  function parseJob51JobsFromDOM() {
    const jobs = [];
    const seen = new Set();
    document
      .querySelectorAll(
        "[sensorsdata], [sensorsData], [sensorsname], [sensorsName]",
      )
      .forEach((el) => {
        const job = parseJob51FromSensorsEl(el);
        if (job && !seen.has(jobKey(job))) {
          seen.add(jobKey(job));
          jobs.push(job);
        }
      });
    document
      .querySelectorAll('.joblist a[href*=".html"], a[href*="jobs.51job.com"]')
      .forEach((link) => {
        const href = link.href || "";
        const m = href.match(/\/(\d+)\.html/);
        if (!m) return;
        const jobId = m[1];
        if (seen.has(jobId)) return;
        seen.add(jobId);
        const card = link.closest(".joblist-item, .joblist > div") || link;
        jobs.push(
          normalizeJob51Item({
            jobId,
            jobName:
              card
                .querySelector?.(".jname, .jobname, .name, span")
                ?.textContent?.trim() || link.textContent?.trim(),
            provideSalaryString:
              card.querySelector?.(".sal, .salary")?.textContent?.trim() || "",
            companyName:
              card.querySelector?.(".cname, .company")?.textContent?.trim() ||
              "",
            companyTypeString: extractJob51CompanyTypeFromCard(card),
            jobHref: href,
          }),
        );
      });
    return jobs.filter(Boolean);
  }

  function buildJob51SearchApiParams(page = 1) {
    const qs = new URLSearchParams(location.search);
    const pageSize = 30;
    const params = new URLSearchParams({
      api_key: "51job",
      timestamp: String(Math.floor(Date.now() / 1000)),
      keyword: qs.get("keyword") || "",
      searchType: qs.get("searchType") || "2",
      function: qs.get("function") || "",
      industry: qs.get("industry") || "",
      jobArea: qs.get("jobArea") || "000000",
      jobArea2: qs.get("jobArea2") || "",
      landmark: qs.get("landmark") || "",
      metro: qs.get("metro") || "",
      salary: qs.get("salary") || "",
      workYear: qs.get("workYear") || "",
      degree: qs.get("degree") || "",
      companyType: qs.get("companyType") || "",
      companySize: qs.get("companySize") || "",
      jobType: qs.get("jobType") || "",
      issueDate: qs.get("issueDate") || "",
      sortType: qs.get("sortType") || "0",
      pageNum: String(page),
      requestId: "",
      pageSize: String(pageSize),
      source: "1",
      accountId: "",
      pageCode: "sou|sou|soulb",
    });
    return { params, pageSize };
  }

  async function fetchJob51JobsFromSearchApi(page = 1) {
    const { params, pageSize } = buildJob51SearchApiParams(page);
    const url = `https://we.51job.com/api/job/search-pc?${params.toString()}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "From-Domain": "51job_web",
          Referer: location.href,
        },
      });
      const text = await resp.text();
      if (text.includes("acw_sc__v2") || text.includes("<html")) {
        log(`搜索接口 p${page}: WAF 拦截，将依赖页面 DOM`, "warn");
        return { list: [], hasMore: false };
      }
      const data = JSON.parse(text);
      if (data.status !== "1" && data.status !== 1 && !data.resultbody) {
        log(`搜索接口 p${page}: ${data.message || data.status}`, "warn");
        return { list: [], hasMore: false };
      }
      const rawList = extractJob51FromApiData(data);
      const list = rawList.map((item) => ({ ...item, pageNum: page }));
      if (list.length) ingestJobList(list, `搜索接口 p${page}`);
      const total =
        data?.resultbody?.job?.totalCount || data?.resultbody?.job?.total || 0;
      const hasMore =
        total > 0 ? page * pageSize < total : list.length >= pageSize;
      return { list, hasMore };
    } catch (err) {
      log(`搜索接口 p${page} 请求失败: ${err.message}`, "warn");
      return { list: [], hasMore: false };
    }
  }

  function findJob51Card(job) {
    const jobId = String(job.jobId || job.encryptJobId || "");
    if (!jobId) return null;
    for (const el of document.querySelectorAll(
      "[sensorsdata], [sensorsData], [sensorsname], [sensorsName]",
    )) {
      try {
        const raw =
          el.getAttribute("sensorsdata") ||
          el.getAttribute("sensorsData") ||
          el.getAttribute("sensorsname") ||
          el.getAttribute("sensorsName");
        const data = JSON.parse(raw);
        if (String(data.jobId || data.jobid) === jobId) {
          return (
            el.closest(".joblist-item, .joblist > div, .job_item") ||
            el.parentElement
          );
        }
      } catch {
        /* ignore */
      }
    }
    const link = document.querySelector(`a[href*="/${jobId}.html"]`);
    if (link)
      return (
        link.closest(".joblist-item, .joblist > div, .job_item") ||
        link.parentElement
      );
    return null;
  }

  function findJob51ApplyButton(card) {
    if (!card) return null;
    const candidates = card.querySelectorAll("button, a, span, div");
    for (const el of candidates) {
      const t = (el.textContent || "").replace(/\s+/g, "");
      if (!t) continue;
      if (/已投递|已申请|去聊|沟通|收藏/.test(t)) continue;
      if (
        /^(立即)?投递$|^申请职位$/.test(t) ||
        (t.includes("投递") && t.length <= 6)
      ) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
      }
    }
    return null;
  }

  function safeClick(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    if (typeof el.click === "function") el.click();
  }

  function isVisibleEl(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      rect.width > 5 &&
      rect.height > 5
    );
  }

  /** 查找包含「投递成功」的可见弹窗 */
  function findJob51SuccessPopup() {
    const popupSelectors = [
      ".van-popup",
      ".van-dialog",
      ".el-dialog",
      ".el-message-box",
      '[role="dialog"]',
      '[class*="popup"]',
      '[class*="modal"]',
    ];
    for (const sel of popupSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisibleEl(el)) continue;
        if (/投递成功/.test(el.textContent || "")) return el;
      }
    }
    return null;
  }

  /** 在弹窗内查找关闭按钮（右上角 X） */
  function findCloseButtonInPopup(popup) {
    if (!popup) return null;
    const iconSelectors = [
      ".van-popup__close-icon",
      ".van-icon-cross",
      ".van-dialog__close",
      ".el-dialog__close",
      ".el-message-box__close",
      ".icon-close",
      '[aria-label="Close"]',
      '[aria-label="关闭"]',
      'i[class*="close"]',
      'button[class*="close"]',
    ];
    for (const sel of iconSelectors) {
      const btn = popup.querySelector(sel);
      if (btn && isVisibleEl(btn)) return btn;
    }
    // 兜底：弹窗右上角小尺寸可点击元素（51job 投递成功弹窗的 X）
    const popupRect = popup.getBoundingClientRect();
    for (const el of popup.querySelectorAll("i, span, button, div, a")) {
      if (!isVisibleEl(el)) continue;
      const text = (el.textContent || "").trim();
      const cls = String(el.className || "");
      if (/^(×|✕|X|x)$/.test(text) || /close|cross|关闭/i.test(cls)) return el;
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.width <= 48 &&
        r.height <= 48 &&
        r.top <= popupRect.top + 72 &&
        r.right >= popupRect.right - 72
      ) {
        return el;
      }
    }
    return null;
  }

  /** 处理投递确认弹窗（确认投递 / 确定 等） */
  async function handleJob51ApplyConfirmPopup() {
    const confirmTexts = [
      "确认投递",
      "立即投递",
      "申请职位",
      "使用此简历投递",
      "确定投递",
      "确定",
    ];
    for (let i = 0; i < 10; i++) {
      await sleep(400);
      const dialogs = document.querySelectorAll(
        '.van-popup, .el-dialog, .el-message-box, [role="dialog"]',
      );
      for (const dialog of dialogs) {
        if (!isVisibleEl(dialog)) continue;
        // 跳过已成功弹窗，留给 success 处理器
        if (/投递成功/.test(dialog.textContent || "")) continue;
        const buttons = dialog.querySelectorAll("button, a, span");
        for (const btn of buttons) {
          const t = (btn.textContent || "").replace(/\s+/g, "");
          if (confirmTexts.some((w) => t === w || t.includes(w))) {
            safeClick(btn);
            await sleep(800);
            return;
          }
        }
      }
    }
  }

  /** 关闭「投递成功」弹窗（含 QR 码推广页） */
  async function handleJob51SuccessPopup(maxWaitMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const popup = findJob51SuccessPopup();
      if (popup) {
        log("检测到投递成功弹窗，正在关闭…", "info");
        const closeBtn = findCloseButtonInPopup(popup);
        if (closeBtn) {
          safeClick(closeBtn);
          await sleep(700);
          if (!findJob51SuccessPopup()) return true;
        }
        // 兜底：点击遮罩层
        const overlay = document.querySelector(
          ".van-overlay, .van-popup__overlay, .el-overlay",
        );
        if (overlay && isVisibleEl(overlay)) {
          safeClick(overlay);
          await sleep(500);
          if (!findJob51SuccessPopup()) return true;
        }
        // 兜底：ESC
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
        await sleep(500);
        if (!findJob51SuccessPopup()) return true;
      }
      await sleep(300);
    }
    return !findJob51SuccessPopup();
  }

  /** 统一处理 51job 投递相关弹窗 */
  async function handleJob51Popup() {
    await handleJob51ApplyConfirmPopup();
    await handleJob51SuccessPopup();
  }

  async function navigateJob51ToPage(pageNum) {
    if (pageNum <= 1) return true;
    const input = document.querySelector(
      '.bottom-page input, .el-pagination input, input[type="number"]',
    );
    if (input) {
      input.value = String(pageNum);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await sleep(2500);
      return true;
    }
    const nextBtn = document.querySelector(
      ".btn-next, .el-pagination__next, .ant-pagination-next",
    );
    if (nextBtn && pageNum === 2) {
      safeClick(nextBtn);
      await sleep(2500);
      return true;
    }
    return false;
  }

  async function ensureJob51CardVisible(job) {
    let card = findJob51Card(job);
    if (card) return card;
    const targetPage = job.pageNum || 0;
    if (targetPage > 1) {
      log(`职位在第 ${targetPage} 页，尝试跳转…`, "info");
      await navigateJob51ToPage(targetPage);
      await sleep(1500);
      card = findJob51Card(job);
      if (card) return card;
    }
    return null;
  }

  async function checkJob51Active(job) {
    const timeStr = job.updateTime || "";
    if (!timeStr) return true;
    if (/[周月年]|30天|60天|90天/.test(timeStr)) return false;
    return true;
  }

  async function greetJob51Job(job, cfg) {
    if (job.isApplied) throw new Error("已投递");
    let card = await ensureJob51CardVisible(job);
    if (!card) {
      throw new Error("当前页面未找到该职位，请确认在搜索结果页且页面已加载");
    }
    const applyBtn = findJob51ApplyButton(card);
    if (!applyBtn) throw new Error("未找到投递按钮（可能已投递）");
    safeClick(applyBtn);
    await sleep(1200);
    // 先填附言，再确认投递，最后关闭成功弹窗
    if (cfg.greeting) {
      await tryFillJob51CoverLetter(cfg.greeting, job);
    }
    await handleJob51ApplyConfirmPopup();
    await handleJob51SuccessPopup();
    return { success: true };
  }

  async function tryFillJob51CoverLetter(template, job) {
    await sleep(800);
    const textarea = document.querySelector(
      '.van-popup textarea, .el-dialog textarea, .el-message-box textarea, textarea[placeholder*="附言"], textarea[placeholder*="留言"]',
    );
    if (!textarea) return;
    const text = formatGreeting(template, job);
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------- 平台路由 ----------

  function extractJobsFromApiData(data) {
    return platform === "job51"
      ? extractJob51FromApiData(data)
      : extractBossJobsFromApiData(data);
  }

  function parseJobsFromDOM() {
    return platform === "job51"
      ? parseJob51JobsFromDOM()
      : parseBossJobsFromDOM();
  }

  function getVueJobList() {
    return platform === "boss" ? getBossVueJobList() : null;
  }

  function mergeJobs() {
    const map = new Map();
    const sources = [
      ...capturedJobs,
      ...(getVueJobList() || []),
      ...parseJobsFromDOM(),
    ];
    sources.forEach((job) => upsertJob(map, job));
    return [...map.values()];
  }

  function hookNetworkForJobs() {
    if (window.__bagNetworkHooked__) return;
    // 等页面安全脚本初始化后再 hook，降低被检测为篡改环境的概率
    if (platform === "boss" && document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hookNetworkForJobs, {
        once: true,
      });
      return;
    }
    window.__bagNetworkHooked__ = true;

    const jobApiPattern =
      platform === "job51"
        ? /search-pc|job\/search|deliver|apply|resume/i
        : /joblist|job\/list|search\/job|recommend/i;

    const handleJobResponse = (url, text) => {
      if (!jobApiPattern.test(url)) return;
      try {
        const data = JSON.parse(text);
        const list = extractJobsFromApiData(data);
        if (list.length) ingestJobList(list, "接口");
      } catch {
        /* ignore */
      }
    };

    const origFetch = window.fetch;
    const hookedFetch = async function (...args) {
      const resp = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        if (jobApiPattern.test(url)) {
          resp
            .clone()
            .text()
            .then((text) => handleJobResponse(url, text))
            .catch(() => {});
        }
      } catch {
        /* ignore */
      }
      return resp;
    };
    hookedFetch.toString = () => origFetch.toString();
    Object.defineProperty(hookedFetch, "name", { value: "fetch" });
    window.fetch = hookedFetch;

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const patchedOpen = function (method, url, ...rest) {
      this._bagUrl = String(url);
      return origOpen.call(this, method, url, ...rest);
    };
    patchedOpen.toString = () => origOpen.toString();
    XMLHttpRequest.prototype.open = patchedOpen;

    const patchedSend = function (...args) {
      this.addEventListener("load", function () {
        handleJobResponse(this._bagUrl || "", this.responseText);
      });
      return origSend.apply(this, args);
    };
    patchedSend.toString = () => origSend.toString();
    XMLHttpRequest.prototype.send = patchedSend;
  }

  function getJobListContainer() {
    if (platform === "job51") {
      return (
        document.querySelector(".joblist") ||
        document.querySelector(".j_result") ||
        document.querySelector(".post") ||
        document.querySelector("#app")
      );
    }
    return (
      document.querySelector(".job-list-box") ||
      document.querySelector(".job-list") ||
      document.querySelector(".scroll-box") ||
      document.querySelector(".jobs-list") ||
      document.querySelector("#wrap")
    );
  }

  async function autoScrollJobList(rounds = 3) {
    const container = getJobListContainer();
    for (let i = 0; i < rounds; i++) {
      if (container && container.scrollHeight > container.clientHeight) {
        container.scrollTop = container.scrollHeight;
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      await sleep(800);
    }
    if (container) container.scrollTop = 0;
  }

  async function fetchJobsFromSearchApi(page = 1) {
    return platform === "job51"
      ? fetchJob51JobsFromSearchApi(page)
      : fetchBossJobsFromSearchApi(page);
  }

  /** Boss 多关键词 × 多城市批量搜岗，突破推荐页岗位枯竭 */
  async function fetchBossMultiKeywordJobs(cfg) {
    if (bossEnvBlocked) {
      await fetchBossJobsViaPagePagination(cfg.pagesPerKeyword || 3);
      return;
    }

    const keywords = splitKeywords(cfg.searchKeywords);
    const cities = resolveBossCityCodes(cfg.searchCities);
    const pagesPerKeyword = Math.max(1, cfg.pagesPerKeyword || 3);

    if (!keywords.length) {
      log("未配置搜索关键词，回退到当前页面 URL 参数搜岗", "warn");
      return fetchBossSingleQueryPages(cfg.maxFetchPages || 5);
    }

    log(
      `多关键词搜岗：${keywords.length} 个词 × ${cities.length} 个城市 × 每词 ${pagesPerKeyword} 页`,
      "info",
    );

    for (const city of cities) {
      const cityLabel = getBossCityLabel(city);
      for (const query of keywords) {
        if (bossEnvBlocked) {
          log("搜索 API 触发风控，剩余关键词改从当前页采集", "warn");
          await fetchBossJobsViaPagePagination(pagesPerKeyword);
          return;
        }
        log(`── 搜索「${query}」@ ${cityLabel}`, "info");
        for (let page = 1; page <= pagesPerKeyword; page++) {
          const { list, hasMore, envBlocked } =
            await fetchBossJobsFromSearchApi(page, {
              query,
              city,
            });
          log(
            `  p${page}: ${list.length} 个，累计 ${capturedJobs.length} 个（去重后）`,
            list.length ? "info" : "warn",
          );
          if (envBlocked) {
            await fetchBossJobsViaPagePagination(pagesPerKeyword);
            return;
          }
          if (!hasMore || list.length === 0) break;
          if (page < pagesPerKeyword) await sleep(2000);
        }
        await sleep(1500);
      }
    }
  }

  async function fetchBossSingleQueryPages(maxPages = 5) {
    if (bossEnvBlocked) {
      await fetchBossJobsViaPagePagination(maxPages);
      return;
    }
    log(`单关键词拉取，最多 ${maxPages} 页…`, "info");
    for (let page = 1; page <= maxPages; page++) {
      const { list, hasMore, envBlocked } =
        await fetchBossJobsFromSearchApi(page);
      log(
        `第 ${page} 页获取 ${list.length} 个，累计 ${capturedJobs.length} 个职位`,
        "info",
      );
      if (envBlocked) {
        await fetchBossJobsViaPagePagination(maxPages - page + 1);
        return;
      }
      if (!hasMore || list.length === 0) {
        log("已拉取全部页面", "info");
        break;
      }
      if (page < maxPages) await sleep(2000);
    }
  }

  async function fetchMultiplePagesFromSearchApi(maxPages = 5) {
    if (platform === "boss" && bossEnvBlocked) {
      await fetchBossJobsViaPagePagination(maxPages);
      return;
    }
    if (platform === "boss" && !getBossToken()) {
      log("未获取登录 token，无法调用搜索接口，将仅依赖页面 DOM", "warn");
      await collectBossJobsFromPageOnly("页面 DOM");
      return;
    }
    const cfg = loadConfig();
    if (
      platform === "boss" &&
      cfg.multiKeywordSearch &&
      splitKeywords(cfg.searchKeywords).length
    ) {
      return fetchBossMultiKeywordJobs(cfg);
    }
    if (platform === "boss") {
      return fetchBossSingleQueryPages(maxPages);
    }
    log(`开始批量拉取，最多 ${maxPages} 页…`, "info");
    for (let page = 1; page <= maxPages; page++) {
      const { list, hasMore } = await fetchJobsFromSearchApi(page);
      log(
        `第 ${page} 页获取 ${list.length} 个，累计 ${capturedJobs.length} 个职位`,
        "info",
      );
      if (!hasMore || list.length === 0) {
        log("已拉取全部页面", "info");
        break;
      }
      if (page < maxPages) await sleep(1500);
    }
  }

  async function scanAndCollectJobs(maxWaitMs = 20000) {
    const cfg = loadConfig();
    const start = Date.now();
    let lastCount = 0;
    while (Date.now() - start < maxWaitMs) {
      await autoScrollJobList(1);
      const jobs = mergeJobs();
      if (jobs.length) {
        if (jobs.length === lastCount && jobs.length >= 5) break;
        lastCount = jobs.length;
        log(`扫描中… 已发现 ${jobs.length} 个职位`, "info");
      }
      const loading = document.body?.innerText?.includes("加载中");
      if (!loading && jobs.length) break;
      await sleep(1200);
    }
    await fetchMultiplePagesFromSearchApi(cfg.maxFetchPages || 5);
    if (platform === "boss" && bossEnvBlocked && !mergeJobs().length) {
      await collectBossJobsFromPageOnly("页面 DOM");
    }
    return mergeJobs();
  }

  async function loadMoreJobsIfNeeded() {
    if (state.index < state.jobs.length) return true;
    const cfg = loadConfig();
    const currentPageCount = Math.ceil(state.jobs.length / 30) || 1;
    const nextPage = currentPageCount + 1;
    const maxPages = (cfg.maxFetchPages || 5) * 2;

    if (nextPage <= maxPages && !(platform === "boss" && bossEnvBlocked)) {
      log(`当前批次已处理完，拉取第 ${nextPage} 页…`, "info");
      const { list } = await fetchJobsFromSearchApi(nextPage);
      if (list.length) {
        state.jobs = mergeJobs();
        if (state.index < state.jobs.length) return true;
      }
    } else if (platform === "boss" && bossEnvBlocked) {
      log("环境风控模式：尝试翻页加载更多职位…", "info");
      await fetchBossJobsViaPagePagination(1);
      state.jobs = mergeJobs();
      if (state.index < state.jobs.length) return true;
    }

    if (platform === "boss") {
      const vue = document.querySelector(".job-recommend-main")?.__vue__;
      if (vue?.searchJobAction) {
        log("尝试 Vue 加载更多职位…", "info");
        vue.next = 5;
        await vue.searchJobAction((vue.pageVo?.page || 1) + 1, {
          loadMore: true,
        });
        await sleep(3000);
        state.jobs = mergeJobs();
        if (state.index < state.jobs.length) return true;
      }
    }

    const nextBtn = document.querySelector(
      platform === "job51"
        ? ".btn-next, .el-pagination__next, .ant-pagination-next, .pager-next"
        : '.ui-icon-arrow-right, .options-pages a.next, .pagination a.next, [class*="next"]',
    );
    if (
      nextBtn &&
      !nextBtn.closest(".disabled, [disabled]") &&
      !nextBtn.disabled
    ) {
      log("点击下一页…", "info");
      safeClick(nextBtn);
      await sleep(3000);
      state.jobs = mergeJobs();
      return state.index < state.jobs.length;
    }
    return false;
  }

  function shouldSkip(job, cfg, greetedSet) {
    const jobName = job.jobName || "";
    const titleText = `${jobName} ${job.brandName || ""}`;

    // Boss 打招呼强依赖 securityId，缺失的多为 DOM 残缺数据，直接跳过而非失败
    if (platform === "boss" && !job.securityId)
      return "缺少 securityId（DOM 残缺数据，无法打招呼）";

    if (platform === "job51" && job.isApplied) return "已投递";

    if (platform === "job51") {
      const companyTypeReason = checkJob51CompanyTypeFilter(job, cfg);
      if (companyTypeReason) return companyTypeReason;
    }

    if (cfg.excludeOutsourcing && isOutsourcingCompany(job.brandName))
      return "外包公司";

    const blacklist = splitKeywords(cfg.blacklist);
    if (blacklist.length && blacklist.some((w) => titleText.includes(w)))
      return "黑名单匹配";

    const whitelist = splitKeywords(cfg.whitelist);
    if (whitelist.length && !jobNameMatchesAny(jobName, whitelist))
      return "不在白名单（岗位名称不匹配）";

    const minSal = parseSalaryMin(job.salaryDesc);
    if (minSal > 0 && minSal < cfg.minSalary)
      return `薪资低于 ${cfg.minSalary}k`;

    const maxSal = parseSalaryMax(job.salaryDesc);
    if (cfg.minMaxSalary > 0) {
      if (maxSal > 0 && maxSal < cfg.minMaxSalary)
        return `最高薪资 ${maxSal}k 低于 ${cfg.minMaxSalary}k`;
      if (maxSal === 0 && job.salaryDesc) {
        const parsed = parseSalaryRange(job.salaryDesc);
        if (parsed.min === 0 && parsed.max === 0)
          log(`⚠️ 薪资「${job.salaryDesc}」无法解析，已放行`, "warn");
        else
          log(
            `⚠️ 薪资「${job.salaryDesc}」无法解析最高值（已解析最低 ${parsed.min}k），已放行`,
            "warn",
          );
      }
    }

    if (cfg.skipGreeted && greetedSet.has(jobKey(job)))
      return `已${meta.actionVerb}过`;

    return null;
  }

  async function checkJobActive(job) {
    return platform === "job51" ? checkJob51Active(job) : checkBossActive(job);
  }

  async function greetJob(job, cfg) {
    return platform === "job51"
      ? greetJob51Job(job, cfg)
      : greetBossJob(job, cfg);
  }

  // ---------- 主流程 ----------

  async function processNext() {
    if (!state.running) return;
    const cfg = loadConfig();
    const greetedSet = loadGreetedSet();

    if (state.success >= cfg.maxCount) {
      log(`已达本次上限 ${cfg.maxCount} 条，自动停止`, "warn");
      stopRun();
      return;
    }

    if (state.index >= state.jobs.length) {
      const hasMore = await loadMoreJobsIfNeeded();
      if (!hasMore) {
        log("所有职位已处理完毕", "success");
        stopRun();
        return;
      }
    }

    const job = state.jobs[state.index];
    state.index++;
    updateStats();

    const label = `${job.brandName || ""} · ${job.jobName || ""}`;
    const skipReason = shouldSkip(job, cfg, greetedSet);

    if (skipReason) {
      log(`跳过：${label}（${skipReason}）`, "warn");
      state.skip++;
      updateStats();
      await randomDelay(cfg.delayMin, cfg.delayMax);
      processNext();
      return;
    }

    if (cfg.skipInactive) {
      const active = await checkJobActive(job);
      if (!active) {
        log(`跳过：${label}（职位/HR 不活跃）`, "warn");
        state.skip++;
        updateStats();
        await randomDelay(cfg.delayMin, cfg.delayMax);
        processNext();
        return;
      }
    }

    try {
      log(`${meta.actionVerb}：${label}`, "info");
      await greetJob(job, cfg);
      greetedSet.add(jobKey(job));
      saveGreetedSet(greetedSet);
      state.success++;
      log(`成功：${label}`, "success");
    } catch (err) {
      const softSkip =
        platform === "boss"
          ? /开聊提醒|开聊|已沟通|重复|不可重复/i.test(err.message)
          : /已投递|已申请|重复|上限|次数/i.test(err.message);
      if (softSkip) {
        log(`跳过：${label}（${err.message}）`, "warn");
        state.skip++;
        updateStats();
        await randomDelay(cfg.delayMin, cfg.delayMax);
        processNext();
        return;
      }
      state.fail++;
      log(`失败：${label} — ${err.message}`, "error");
      if (platform === "boss" && isBossEnvError(err.message)) {
        markBossEnvBlocked(err.message);
        log("检测到环境风控，已自动停止", "error");
        stopRun();
        return;
      }
      if (/频繁|限制|验证|quota|次数|上限/i.test(err.message)) {
        log("检测到平台限制，已自动停止", "error");
        stopRun();
        return;
      }
    }

    updateStats();
    await randomDelay(cfg.delayMin, cfg.delayMax);
    processNext();
  }

  async function startRun() {
    if (state.running) return;
    readPanelConfig();

    const startBtn = document.getElementById("bag-start");
    const stopBtn = document.getElementById("bag-stop");
    if (startBtn) startBtn.disabled = true;

    log("正在扫描职位列表，请稍候…", "info");
    showToast("正在扫描职位列表…", "info", 3000);

    state.jobs = await scanAndCollectJobs();

    if (!state.jobs.length) {
      const cfg = loadConfig();
      const hint =
        platform === "boss" && cfg.multiKeywordSearch
          ? "未找到职位：请确认已登录；可点「深度搜岗」或勾选多关键词搜岗后重试"
          : "未找到职位：请确认页面已加载出职位卡片（非「加载中」状态）";
      log(hint, "error");
      showToast(hint, "error", 8000);
      if (startBtn) startBtn.disabled = false;
      return;
    }

    state.running = true;
    state.index = 0;
    state.success = 0;
    state.skip = 0;
    state.fail = 0;

    if (stopBtn) stopBtn.disabled = false;
    log(`开始处理，共 ${state.jobs.length} 个职位`, "success");
    showToast(
      `已找到 ${state.jobs.length} 个职位，开始${meta.actionVerb}`,
      "success",
      4000,
    );
    updateStats();
    processNext();
  }

  async function refreshJobList() {
    log("手动刷新职位列表…", "info");
    const jobs = await scanAndCollectJobs(8000);
    showToast(
      jobs.length
        ? `已刷新，共 ${jobs.length} 个职位`
        : "仍未找到职位，请等待页面加载",
      jobs.length ? "success" : "warn",
    );
    updateStats();
  }

  /** 清空缓存并执行多关键词深度搜岗（无需手动换搜索词） */
  async function deepSearchJobs() {
    if (state.running) {
      showToast("请先停止当前任务", "warn");
      return;
    }
    readPanelConfig();
    capturedJobs = [];
    log("开始深度搜岗…", "info");
    showToast("深度搜岗中，请稍候…", "info", 3000);

    const cfg = loadConfig();
    if (platform === "boss") {
      if (!getBossToken()) {
        log("未登录 Boss 直聘，请先登录后再深度搜岗", "error");
        showToast("请先登录 Boss 直聘", "error");
        return;
      }
      if (cfg.multiKeywordSearch && splitKeywords(cfg.searchKeywords).length) {
        await fetchBossMultiKeywordJobs(cfg);
      } else {
        await fetchBossSingleQueryPages(cfg.maxFetchPages || 5);
      }
    } else {
      await fetchMultiplePagesFromSearchApi(cfg.maxFetchPages || 5);
    }

    await autoScrollJobList(1);
    const jobs = mergeJobs();
    const passCount = jobs.filter(
      (j) => !shouldSkip(j, cfg, loadGreetedSet()),
    ).length;
    log(
      `深度搜岗完成：共 ${jobs.length} 个，通过筛选约 ${passCount} 个`,
      "success",
    );
    showToast(
      `深度搜岗完成：${jobs.length} 个职位，可打招呼约 ${passCount} 个`,
      "success",
      6000,
    );
    state.jobs = jobs;
    updateStats();
  }

  function stopRun() {
    state.running = false;
    const startBtn = document.getElementById("bag-start");
    const stopBtn = document.getElementById("bag-stop");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    log("已停止", "warn");
  }

  function clearGreetedHistory() {
    localStorage.removeItem(GREETED_KEY);
    log(`已清空${meta.actionVerb}记录`, "info");
  }

  // ---------- UI ----------

  function readPanelConfig() {
    const cfg = {
      greeting:
        document.getElementById("bag-greeting")?.value ||
        DEFAULT_CONFIG.greeting,
      minSalary:
        parseInt(document.getElementById("bag-min-salary")?.value, 10) || 0,
      minMaxSalary:
        parseInt(document.getElementById("bag-min-max-salary")?.value, 10) || 0,
      maxCount:
        parseInt(document.getElementById("bag-max-count")?.value, 10) || 30,
      maxFetchPages:
        parseInt(document.getElementById("bag-max-fetch-pages")?.value, 10) ||
        5,
      delayMin:
        parseFloat(document.getElementById("bag-delay-min")?.value) || 4,
      delayMax:
        parseFloat(document.getElementById("bag-delay-max")?.value) || 10,
      blacklist: document.getElementById("bag-blacklist")?.value || "",
      whitelist: document.getElementById("bag-whitelist")?.value || "",
      skipInactive:
        document.getElementById("bag-skip-inactive")?.checked ?? true,
      skipGreeted: document.getElementById("bag-skip-greeted")?.checked ?? true,
      excludeOutsourcing:
        document.getElementById("bag-exclude-outsourcing")?.checked ?? true,
      job51FilterGuoqi:
        document.getElementById("bag-job51-guoqi")?.checked ?? false,
      job51FilterYangqi:
        document.getElementById("bag-job51-yangqi")?.checked ?? false,
      job51FilterWaiqi:
        document.getElementById("bag-job51-waiqi")?.checked ?? false,
      searchKeywords:
        document.getElementById("bag-search-keywords")?.value ??
        DEFAULT_CONFIG.searchKeywords,
      searchCities:
        document.getElementById("bag-search-cities")?.value ??
        DEFAULT_CONFIG.searchCities,
      multiKeywordSearch:
        document.getElementById("bag-multi-keyword")?.checked ?? true,
      pagesPerKeyword:
        parseInt(document.getElementById("bag-pages-per-keyword")?.value, 10) ||
        3,
      bossAutoFollowChat:
        platform === "boss"
          ? (document.getElementById("bag-boss-auto-follow")?.checked ?? true)
          : false,
    };
    saveConfig(cfg);
    return cfg;
  }

  function isTargetPage() {
    if (platform === "boss") {
      return /\/web\/geek\/(job|jobs|job-recommend)/.test(location.pathname);
    }
    return /\/pc\/search/.test(location.pathname) || location.pathname === "/";
  }

  function shouldShowUI() {
    if (!isTargetPage()) return false;
    if (window.self === window.top) return true;
    if (platform === "boss") {
      return !!document.querySelector(
        ".job-list-box, .job-recommend-main, .job-card-wrapper, #wrap",
      );
    }
    return !!document.querySelector(".joblist, .j_result, [sensorsdata], #app");
  }

  function makePanelDraggable(panel) {
    const header = panel.querySelector(".bag-header");
    if (!header) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = `${e.clientX - offsetX}px`;
      panel.style.top = `${e.clientY - offsetY}px`;
      panel.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  function ensureBagStyles() {
    const styleId = "bag-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #bag-panel {
        position: fixed; top: 80px; right: 16px; z-index: 2147483647;
        width: 340px; max-height: 85vh; overflow: auto;
        background: #fff; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.18);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #333;
      }
      #bag-panel * { box-sizing: border-box; }
      #bag-panel .bag-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; color: #fff;
        border-radius: 10px 10px 0 0; cursor: move; user-select: none;
      }
      #bag-panel .bag-header h3 { margin: 0; font-size: 14px; }
      #bag-panel .bag-toggle {
        background: rgba(255,255,255,.2); border: none; color: #fff;
        border-radius: 4px; padding: 2px 8px; cursor: pointer;
      }
      #bag-panel .bag-body { padding: 12px 14px; display: block; }
      #bag-panel.collapsed .bag-body { display: none; }
      #bag-panel label { display: block; margin: 8px 0 4px; font-weight: 600; font-size: 12px; }
      #bag-panel input[type=text],
      #bag-panel input[type=number],
      #bag-panel textarea {
        width: 100%; padding: 6px 8px; border: 1px solid #ddd;
        border-radius: 6px; font-size: 12px;
      }
      #bag-panel textarea { min-height: 72px; resize: vertical; }
      #bag-panel .bag-row { display: flex; gap: 8px; }
      #bag-panel .bag-row > * { flex: 1; }
      #bag-panel .bag-check {
        display: flex; align-items: center; gap: 6px; margin: 6px 0; font-weight: normal;
      }
      #bag-panel .bag-check input { width: auto; }
      #bag-panel .bag-actions {
        display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap;
      }
      #bag-panel .bag-actions button {
        flex: 1; padding: 8px; border: none; border-radius: 6px;
        cursor: pointer; font-size: 13px; font-weight: 600; min-width: 70px;
      }
      #bag-start { color: #fff; }
      #bag-start:disabled, #bag-stop:disabled {
        opacity: .5; cursor: not-allowed;
      }
      #bag-stop { background: #ff4d4f; color: #fff; }
      #bag-clear { background: #f0f0f0; color: #666; flex: 0 0 auto; padding: 8px 12px; }
      #bag-refresh { background: #1677ff; color: #fff; flex: 0 0 auto; padding: 8px 10px; font-size: 12px; }
      #bag-stats { font-size: 12px; color: #666; margin-bottom: 8px; }
      #bag-log {
        max-height: 160px; overflow-y: auto; background: #fafafa;
        border: 1px solid #eee; border-radius: 6px; padding: 6px;
        font-size: 11px;
      }
      .bag-log-line { padding: 2px 0; border-bottom: 1px solid #f0f0f0; word-break: break-all; }
      .bag-log-success { color: #52c41a; }
      .bag-log-error { color: #ff4d4f; }
      .bag-log-warn { color: #faad14; }
      .bag-tip { font-size: 11px; color: #999; margin-top: 8px; line-height: 1.6; }
      @keyframes bag-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      #bag-fab { animation: bag-pulse 2s infinite; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createFab() {
    if (document.getElementById("bag-fab")) return;
    const fab = document.createElement("button");
    fab.id = "bag-fab";
    fab.textContent = `👋 ${meta.actionVerb}`;
    fab.title = `${meta.label}自动${meta.actionVerb}助手 v${SCRIPT_VERSION}`;
    Object.assign(fab.style, {
      position: "fixed",
      right: "12px",
      bottom: "120px",
      zIndex: "2147483646",
      padding: "12px 18px",
      background: meta.theme,
      color: "#fff",
      border: "2px solid #fff",
      borderRadius: "24px",
      cursor: "pointer",
      fontSize: "15px",
      fontWeight: "700",
      boxShadow: `0 4px 20px ${meta.theme}88`,
      animation: "bag-pulse 2s infinite",
    });
    fab.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const panel = document.getElementById("bag-panel");
      if (!panel) {
        createPanel();
        return;
      }
      panel.classList.remove("collapsed");
      panel.style.display = "block";
    });
    getMountRoot().appendChild(fab);
  }

  function createPanel() {
    if (document.getElementById("bag-panel")) return;
    const cfg = loadConfig();
    ensureBagStyles();

    const bossSearchSection =
      platform === "boss"
        ? `
        <label>搜索关键词（逗号分隔，多词轮询搜岗）</label>
        <input type="text" id="bag-search-keywords" value="${cfg.searchKeywords}" placeholder="前端开发,Vue,React">
        <div class="bag-row">
          <div>
            <label>城市代码</label>
            <input type="text" id="bag-search-cities" value="${cfg.searchCities}" title="101010100=北京，100010000=全国，可多城市逗号分隔">
          </div>
          <div>
            <label>每词拉取页数</label>
            <input type="number" id="bag-pages-per-keyword" value="${cfg.pagesPerKeyword}" min="1" max="10">
          </div>
        </div>
        <label class="bag-check"><input type="checkbox" id="bag-multi-keyword" ${cfg.multiKeywordSearch !== false ? "checked" : ""}> 启用多关键词搜岗（推荐，突破推荐页枯竭）</label>
        <label class="bag-check"><input type="checkbox" id="bag-boss-auto-follow" ${cfg.bossAutoFollowChat !== false ? "checked" : ""}> VIP 自动追聊（打招呼后自动开启）</label>
        `
        : "";

    const platformTip =
      platform === "boss"
        ? `刷不到岗位时：先点「深度搜岗」，再点「开始」。<br>
           建议关闭 Boss「个性化推荐」：我的 → 设置 → 个性化推荐。<br>
           已开 VIP 可勾选「自动追聊」，每次打招呼后自动触发。<br>
           「优先提醒 Boss」官方已下线，脚本不再提供该功能。<br>
           间隔建议 ≥8 秒，本次上限 15 条，避免触发风控。`
        : `建议：在 we.51job.com 搜索结果页使用，确保已登录。<br>
           前程无忧为简历投递（非即时聊天），间隔建议 ≥6 秒。<br>
           投递有每日上限，过高频率可能触发限制。<br>
           公司性质筛选依据 API 的 companyTypeString 及公司标签判断。`;

    const job51CompanyTypeSection =
      platform === "job51"
        ? `
        <label>公司性质（勾选后仅投递选中类型，都不勾选则不限）</label>
        <label class="bag-check"><input type="checkbox" id="bag-job51-guoqi" ${cfg.job51FilterGuoqi ? "checked" : ""}> 国企（含地方国企）</label>
        <label class="bag-check"><input type="checkbox" id="bag-job51-yangqi" ${cfg.job51FilterYangqi ? "checked" : ""}> 央企（含「中国XX集团」等）</label>
        <label class="bag-check"><input type="checkbox" id="bag-job51-waiqi" ${cfg.job51FilterWaiqi ? "checked" : ""}> 外企（外资/欧美/非欧美）</label>
        `
        : "";

    const panel = document.createElement("div");
    panel.id = "bag-panel";
    panel.innerHTML = `
      <div class="bag-header" style="background:${meta.theme}">
        <h3>${meta.label} 自动${meta.actionVerb}</h3>
        <button class="bag-toggle" id="bag-collapse">收起</button>
      </div>
      <div class="bag-body">
        <div id="bag-stats">进度 0/0 | 成功 0 | 跳过 0 | 失败 0</div>
        <div class="bag-actions">
          <button id="bag-start" style="background:${meta.theme}">开始</button>
          <button id="bag-stop" disabled>停止</button>
          <button id="bag-deep-search" style="background:#722ed1;color:#fff">深度搜岗</button>
          <button id="bag-refresh">刷新职位</button>
          <button id="bag-clear">清记录</button>
        </div>
        ${bossSearchSection}
        <label>招呼语/附言（支持 {jobName} {company} {salary}）${platform === "job51" ? "，投递弹窗有附言框时自动填写" : ""}</label>
        <textarea id="bag-greeting">${cfg.greeting}</textarea>
        <div class="bag-row">
          <div>
            <label>最低薪资(k)</label>
            <input type="number" id="bag-min-salary" value="${cfg.minSalary}" min="0">
          </div>
          <div>
            <label>最高薪资下限(k)</label>
            <input type="number" id="bag-min-max-salary" value="${cfg.minMaxSalary}" min="0" title="排除最高薪资低于此值的岗位，0 表示不限">
          </div>
          <div>
            <label>本次上限</label>
            <input type="number" id="bag-max-count" value="${cfg.maxCount}" min="1">
          </div>
          <div>
            <label>预拉取页数</label>
            <input type="number" id="bag-max-fetch-pages" value="${cfg.maxFetchPages}" min="1" max="20" title="启动时主动拉取的搜索结果页数">
          </div>
        </div>
        <div class="bag-row">
          <div>
            <label>最小间隔(秒)</label>
            <input type="number" id="bag-delay-min" value="${cfg.delayMin}" min="1" step="0.5">
          </div>
          <div>
            <label>最大间隔(秒)</label>
            <input type="number" id="bag-delay-max" value="${cfg.delayMax}" min="1" step="0.5">
          </div>
        </div>
        <label>岗位黑名单（匹配岗位名/公司名，逗号分隔）</label>
        <input type="text" id="bag-blacklist" value="${cfg.blacklist}">
        <label>岗位白名单（仅匹配岗位名称，留空则不限制）</label>
        <input type="text" id="bag-whitelist" value="${cfg.whitelist}" placeholder="前端,前端开发,前端工程师">
        ${job51CompanyTypeSection}
        <label class="bag-check"><input type="checkbox" id="bag-exclude-outsourcing" ${cfg.excludeOutsourcing !== false ? "checked" : ""}> 排除外包公司（中软/软通/文思海辉等 ${OUTSOURCING_COMPANIES.length}+ 家）</label>
        <label class="bag-check"><input type="checkbox" id="bag-skip-inactive" ${cfg.skipInactive ? "checked" : ""}> 跳过不活跃职位/HR</label>
        <label class="bag-check"><input type="checkbox" id="bag-skip-greeted" ${cfg.skipGreeted ? "checked" : ""}> 跳过已${meta.actionVerb}职位</label>
        <label>运行日志</label>
        <div id="bag-log"></div>
        <div class="bag-tip">${platformTip}</div>
      </div>
    `;
    getMountRoot().appendChild(panel);
    document.documentElement.setAttribute(meta.dataAttr, SCRIPT_VERSION);

    makePanelDraggable(panel);

    document.getElementById("bag-collapse").addEventListener("click", () => {
      panel.classList.toggle("collapsed");
    });
    document
      .getElementById("bag-start")
      .addEventListener("click", () => startRun());
    document.getElementById("bag-stop").addEventListener("click", stopRun);
    document
      .getElementById("bag-refresh")
      .addEventListener("click", () => refreshJobList());
    document
      .getElementById("bag-deep-search")
      ?.addEventListener("click", () => deepSearchJobs());
    document
      .getElementById("bag-clear")
      .addEventListener("click", clearGreetedHistory);

    [
      "bag-greeting",
      "bag-min-salary",
      "bag-min-max-salary",
      "bag-max-count",
      "bag-max-fetch-pages",
      "bag-delay-min",
      "bag-delay-max",
      "bag-blacklist",
      "bag-whitelist",
      "bag-search-keywords",
      "bag-search-cities",
      "bag-pages-per-keyword",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", readPanelConfig);
    });
    [
      "bag-exclude-outsourcing",
      "bag-skip-inactive",
      "bag-skip-greeted",
      "bag-multi-keyword",
      "bag-boss-auto-follow",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", readPanelConfig);
    });
    ["bag-job51-guoqi", "bag-job51-yangqi", "bag-job51-waiqi"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", readPanelConfig);
    });

    const loadTip =
      platform === "boss"
        ? "已加载：刷不到岗位时先点「深度搜岗」，再点「开始」"
        : "请滚动页面加载职位后点击「开始」";
    log(`脚本已加载（${meta.label}），${loadTip}`, "info");
    showToast(
      `✅ ${meta.label}助手 v${SCRIPT_VERSION} 已加载，点右下角按钮打开`,
      "success",
      8000,
    );
  }

  // ---------- 初始化 ----------

  function bootstrap() {
    if (!shouldShowUI()) return;
    try {
      hookNetworkForJobs();
      createFab();
      createPanel();
    } catch (err) {
      showToast(`❌ 助手加载失败: ${err.message}`, "error", 10000);
    }
  }

  function waitForMount(retry = 0) {
    if (document.documentElement) {
      bootstrap();
      return;
    }
    if (retry > 80) {
      showToast("❌ 助手等待页面超时，请刷新重试", "error", 10000);
      return;
    }
    setTimeout(() => waitForMount(retry + 1), 250);
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) lastHref = location.href;
    if (shouldShowUI() && !document.getElementById("bag-fab")) bootstrap();
  }, 1500);

  const domWatcher = new MutationObserver(() => {
    if (shouldShowUI() && !document.getElementById("bag-fab")) bootstrap();
  });
  domWatcher.observe(document.documentElement, {
    childList: true,
    subtree: false,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
  waitForMount();
})();
