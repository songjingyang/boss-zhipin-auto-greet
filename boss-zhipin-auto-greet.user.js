// ==UserScript==
// @name         招聘自动打招呼助手（Boss直聘 / 前程无忧）
// @namespace    https://github.com/songjingyang/boss-zhipin-auto-greet
// @version      2.16.2
// @description  Boss 直聘自动打招呼 + VIP 自动追聊 + 前程无忧自动投递
// @author       宋璟阳
// @match        https://www.zhipin.com/web/geek/*
// @match        https://www.zhipin.com/web/geek/job*
// @match        https://www.zhipin.com/web/geek/jobs*
// @match        https://www.zhipin.com/web/geek/job-recommend*
// @match        https://we.51job.com/*
// @icon         https://www.zhipin.com/favicon.ico
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "2.16.2";

  /** Boss 城市代码（逗号分隔多城市搜岗） */
  const BOSS_CITY_PRESETS = {
    北京: "101010100",
    上海: "101020100",
    广州: "101280100",
    深圳: "101280600",
    杭州: "101210100",
    天津: "101030100",
    西安: "101110100",
    苏州: "101190400",
    武汉: "101200100",
    厦门: "101230200",
    长沙: "101250100",
    成都: "101270100",
    郑州: "101180100",
    重庆: "101040100",
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
    customGreetingEnabled: false,
    greeting: "您好，看到贵司「{jobName}」岗位与我的背景较匹配，方便进一步沟通吗？",
    salaryRangeMin: 20,
    salaryRangeMax: 30,
    maxCount: 50,
    maxFetchPages: 5,
    autoNextPage: true,
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
    searchCities: "北京,天津,深圳",
    multiKeywordSearch: true,
    pagesPerKeyword: 3,
    // 商圈/地铁线路代码（逗号分隔，可选）：PC 端能拿到的最细地理筛选维度，
    // 弥补 PC 网页版无法像 App 端用 GPS 做「附近职位」定位的差距。
    // 获取方式：网页搜索结果页左上角选好商圈/地铁线路后，从地址栏 URL 复制对应参数值。
    searchBusinessDistricts: "",
    searchSubwayLines: "",
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
    pagesLoaded: 0,
    index: 0,
    success: 0,
    skip: 0,
    fail: 0,
    jobs: [],
  };

  let panelOpen = false;
  let capturedJobs = [];
  let networkHookStatus = () => "尚未安装";
  const captureDiagnostics = { observed: 0, responses: 0, candidates: 0, lastPath: "", shape: "", parseErrors: 0 };
  /** 最近一次成功打招呼的 Boss 职位，供「探测追聊接口」诊断按钮复用 securityId */
  let lastGreetedBossJob = null;
  // 限制状态跨刷新保留；到期也只允许用户手动启动，不自动恢复任务。
  const BOSS_BLOCK_KEY = `${meta.storagePrefix}_blocked_until`;
  const BOSS_ENV_BLOCK_COOLDOWN_MS = 30 * 60 * 1000;
  let bossBlockedUntil = Number(localStorage.getItem(BOSS_BLOCK_KEY)) || 0;
  let bossEnvBlocked = bossBlockedUntil > Date.now();
  let runGeneration = 0;
  const OLD_DEFAULT_BLACKLIST = "猎头,外包,驻场,信息安全,销售";

  // ---------- 通用工具 ----------

  function parseRunLimit(value, fallback) {
    if (value == null || String(value).trim() === "") return fallback;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const cfg = { ...DEFAULT_CONFIG, ...saved };
      cfg.maxCount = parseRunLimit(cfg.maxCount, DEFAULT_CONFIG.maxCount);
      // 只迁移旧默认 15，保留用户其他上限（含 0 不限）。
      if (!saved.runLimitVersion && Number(saved.maxCount) === 15) cfg.maxCount = 50;
      cfg.runLimitVersion = 1;
      cfg.maxFetchPages = parseRunLimit(cfg.maxFetchPages, DEFAULT_CONFIG.maxFetchPages);
      // 新区间独立保存，旧单值配置不再参与筛选；首次使用按 20–30K 初始化。
      for (const key of ["salaryRangeMin", "salaryRangeMax"]) {
        const value = Number(cfg[key]);
        cfg[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONFIG[key];
      }
      cfg.customGreetingEnabled = saved.customGreetingEnabled === true;
      cfg.greeting = typeof saved.greeting === "string" ? saved.greeting : DEFAULT_CONFIG.greeting;
      delete cfg.expectedSalary;
      delete cfg.minSalary;
      delete cfg.minMaxSalary;
      if (!saved.cityPickerVersion) {
        cfg.searchCities = saved.searchCities && saved.searchCities !== "101010100"
          ? saved.searchCities : "北京,天津,深圳";
        cfg.cityPickerVersion = 1;
      }
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
        // v2.7 新增：商圈/地铁线路细粒度地理筛选
        "searchBusinessDistricts",
        "searchSubwayLines",
      ].forEach((key) => {
        if (!(key in saved)) cfg[key] = DEFAULT_CONFIG[key];
      });
      return cfg;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg) {
    cfg.cityPickerVersion = 1;
    cfg.runLimitVersion = 1;
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

  function parseSalaryRange(salaryDesc, strict = false) {
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
      return { min, max: min };
    }

    if (strict) return { min: 0, max: 0 };

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
      const cfg = loadConfig();
      const pageText = platform === "boss" ? ` | 页/批次 ${state.pagesLoaded}/${cfg.maxFetchPages === 0 ? "不限" : cfg.maxFetchPages}` : "";
      const fullText = `${state.running ? "运行中" : "未运行"}${pageText} | 进度 ${state.index}/${state.jobs.length} | 成功 ${state.success}/${cfg.maxCount === 0 ? "不限" : cfg.maxCount} | 跳过 ${state.skip} | 失败 ${state.fail}`;
      const pages = platform === "boss" ? ` · 页${state.pagesLoaded}/${cfg.maxFetchPages || "∞"}` : "";
      el.textContent = `${state.running ? "运行中" : "未运行"}${pages} · 进度${state.index}/${state.jobs.length} · 成功${state.success}/${cfg.maxCount === 0 ? "不限" : cfg.maxCount} · 跳过${state.skip} · 失败${state.fail}`;
      el.title = fullText;
      el.setAttribute("aria-label", fullText);
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
    const alreadyBlocked = bossEnvBlocked;
    bossEnvBlocked = true;
    bossBlockedUntil = Date.now() + BOSS_ENV_BLOCK_COOLDOWN_MS;
    localStorage.setItem(BOSS_BLOCK_KEY, String(bossBlockedUntil));
    stopRun();
    if (!alreadyBlocked) {
      log(`平台限制：${reason}。已停止请求和自动翻页，暂停至少 30 分钟；请先在网页确认账户状态。`, "warn");
      showToast("检测到平台限制，任务已停止；刷新页面不会恢复", "warn", 6000);
    }
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
      if (bossEnvBlocked) {
        reject(new Error("平台限制暂停中，请稍后确认网页状态再手动启动"));
        return;
      }
      const xhr = new XMLHttpRequest();
      const url = path.startsWith("/")
        ? path
        : path.replace(/^https:\/\/www\.zhipin\.com/, "");
      xhr.open(method, url, true);
      xhr.withCredentials = true;
      xhr.timeout = 20000;
      const merged = {
        ...buildBossApiHeaders(overrides, page, referer),
        ...headers,
      };
      Object.entries(merged).forEach(([k, v]) => {
        if (v != null && v !== "") xhr.setRequestHeader(k, v);
      });
      xhr.onload = () => {
        if ([401, 403, 429].includes(xhr.status)) {
          markBossEnvBlocked(`HTTP ${xhr.status}`);
          reject(new Error(`平台限制 HTTP ${xhr.status}`));
          return;
        }
        let data;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          reject(new Error(`响应解析失败 HTTP ${xhr.status}`));
          return;
        }
        const reason = `${data?.message || ""} code=${data?.code ?? ""}`;
        if (isBossEnvError(reason) || isBossRateLimitError(reason) || /验证|验证码|访问受限|上限|次数|未登录|登录失效/.test(reason)) {
          markBossEnvBlocked(reason);
          reject(new Error(reason));
          return;
        }
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data,
        });
      };
      xhr.onerror = () => reject(new Error("网络请求失败"));
      xhr.ontimeout = () => reject(new Error("请求超时，结果未知，请先在网页确认是否已沟通"));
      xhr.onabort = () => reject(new Error("请求已取消"));
      xhr.send(body);
    });
  }

  function normalizeBossJob(item) {
    if (!item || typeof item !== "object") return null;
    const info = item.jobInfo || item;
    const id = info.encryptJobId || info.encryptId || item.encryptJobId;
    const name = info.jobName || item.jobName;
    if (!id || !name) return null;
    return {
      ...item, ...info,
      encryptJobId: String(id).replace(/\.html$/, ""),
      jobName: name,
      securityId: info.securityId || item.securityId || item.bossInfo?.securityId || "",
      brandName: info.brandName || item.brandName || item.brandInfo?.brandName || "",
      cityName: info.cityName || item.cityName || "",
      cityCode: info.cityCode || item.cityCode || info.city || item.city || "",
      salaryDesc: info.salaryDesc || item.salaryDesc || "",
    };
  }

  function extractBossJobsFromApiData(data) {
    // 优先保留 2.10.0 的直接列表路径，不再强制规范化已有完整字段。
    const zp = data?.zpData || data?.data?.zpData || data;
    const direct = zp?.jobList || zp?.list || zp?.jobs || data?.jobList;
    if (Array.isArray(direct) && direct.some((job) => job?.jobName && (job.encryptJobId || job.encryptId))) {
      return direct.filter((job) => job && typeof job === "object");
    }
    const jobs = [];
    const seen = new WeakSet();
    let budget = 5000;
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 8 || budget-- <= 0 || seen.has(value)) return;
      seen.add(value);
      const job = normalizeBossJob(value);
      if (job) { jobs.push(job); return; }
      for (const child of Object.values(value)) visit(child, depth + 1);
    };
    visit(data);
    return jobs;
  }

  function logCaptureDiagnostics() {
    const d = captureDiagnostics;
    const paths = [...new Set(performance.getEntriesByType("resource").map((entry) => {
      try {
        const url = new URL(entry.name);
        return url.origin === location.origin && url.pathname.startsWith("/wapi/") ? url.pathname : "";
      } catch { return ""; }
    }).filter(Boolean))].slice(-6);
    log(`监听状态：${networkHookStatus()}；经过监听的请求 ${d.observed}；网页接口路径 ${paths.join("、") || "未记录"}`, "info");
    log(`采集诊断 v${SCRIPT_VERSION}：匹配响应 ${d.responses}，解析职位 ${d.candidates}，解析异常 ${d.parseErrors}；最近路径 ${d.lastPath || "未收到"}；结构 ${d.shape || "未知"}`, "warn");
    log(`页面数据：组件职位 ${getBossVueJobList().length}，缓存职位 ${capturedJobs.length}，DOM 职位 ${parseBossJobsFromDOM().length}`, "info");
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
        linkEl.closest(".job-card-wrapper, .job-card-box, li, [data-jobid]") || linkEl,
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
    if (/查看更多|更多信息|详情/.test(linkEl.textContent?.trim() || "")) return;
    let encryptJobId = "";
    let securityId = "";
    let lid = "";
    try {
      const url = new URL(href, location.origin);
      encryptJobId = (url.pathname.match(/job_detail\/([^/?#]+)/)?.[1] || "").replace(/\.html$/, "");
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

  // 只读取页面组件持有的职位对象，不调用组件方法或额外接口。
  function getBossVueJobList() {
    const jobs = [];
    const seen = new WeakSet();
    let budget = 3000;
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 6 || budget-- <= 0 || seen.has(value)) return;
      if (value instanceof Node || value === window) return;
      seen.add(value);
      if ((value.encryptJobId || value.encryptId) && value.jobName && value.securityId) {
        jobs.push(value);
        return;
      }
      const job = normalizeBossJob(value);
      if (job?.securityId) {
        jobs.push(job);
        return;
      }
      for (const key of Object.keys(value).slice(0, 100)) {
        if (["parent", "root", "appContext", "proxy", "provides"].includes(key)) continue;
        try { visit(value[key], depth + 1); } catch { /* 可选组件字段 */ }
      }
    };
    const elements = new Set(document.querySelectorAll(".job-card-wrapper, .job-card-box, .job-list-box, .job-list, .jobs-search-page, #wrap, #app"));
    // 新版卡片 class 变化时，从真实职位链接沿 DOM 父级寻找组件。
    for (const link of [...document.querySelectorAll('a[href*="/job_detail/"]')].slice(0, 100)) {
      let node = link;
      for (let i = 0; node && i < 8; i++, node = node.parentElement) elements.add(node);
    }
    for (const el of elements) {
      let vue2 = el.__vue__;
      let vue3 = el.__vueParentComponent;
      for (let i = 0; i < 8 && (vue2 || vue3); i++) {
        try {
          visit(vue2?.jobList); visit(vue2?.jobCardList);
          visit(vue2?.$data); visit(vue2?.$props);
          visit(vue3?.props); visit(vue3?.setupState); visit(vue3?.data);
          visit(vue3?.ctx?.jobList); visit(vue3?.ctx?.jobCardList);
        } catch { /* 不阻断其他卡片 */ }
        vue2 = vue2?.$parent;
        vue3 = vue3?.parent;
      }
    }
    return jobs;
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
      // 商圈/地铁线路：比城市代码更细的地理筛选，PC 端能拿到的最接近 App 端「附近职位」的维度
      "multiBusinessDistrict",
      "multiSubway",
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
    if (bossEnvBlocked) return { list: [], hasMore: false, envBlocked: true };
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
    // 只读已加载的卡片，不点击模糊匹配的 next/more 元素。
    await collectBossJobsFromPageOnly("当前页");
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
    // 请求前再次读取最新配置，等待期间修改城市也立即生效。
    const cityReason = checkBossCityFilter(job, loadConfig());
    if (cityReason) throw new Error(cityReason);
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
    if (!data || data.code !== 0) {
      if (isBossEnvError(data?.message)) markBossEnvBlocked(data?.message);
      throw new Error(data?.message || `接口错误 code=${data?.code}`);
    }
    lastGreetedBossJob = job;
    if (cfg.customGreetingEnabled && cfg.greeting.trim()) {
      if (data.zpData?.showGreeting) await tryCustomGreeting(job, cfg);
      else log("网站未提供自定义招呼入口，本次未发送自定义内容", "warn");
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

  /**
   * 尝试通过 VIP 接口为单个会话开启自动追聊。
   * 候选接口第一条 setRemind 是网上公开抓包验证过的真实「优先提醒」接口
   * （https://www.zhipin.com/wapi/zpitem/web/online/setRemind，body: securityId + source=12）；
   * 「自动追聊」很可能是同一功能改了 UI 文案，接口地址不变，因此放在第一优先级。
   * 其余为未经验证的猜测路径，作为兜底尝试保留。
   */
  async function tryEnableBossAutoFollowViaApi(securityId) {
    const sid = encodeURIComponent(securityId);
    const candidates = [
      {
        path: "/wapi/zpitem/web/online/setRemind",
        body: `securityId=${sid}&source=12&`,
      },
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

    const attempts = [];
    for (const item of candidates) {
      try {
        const { status, data } = await bossApiRequest("POST", item.path, {
          body: item.body,
          referer: "https://www.zhipin.com/web/geek/chat",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        // 完整返回体（截断）打进日志，不用开 DevTools 也能看到接口真实响应，便于定位
        const bodyPreview = JSON.stringify(data ?? {}).slice(0, 200);
        if (data?.code !== 0) {
          attempts.push(
            `${item.path} → HTTP${status} code=${data?.code} ${data?.message || ""} | body=${bodyPreview}`,
          );
          continue;
        }
        const ok =
          data?.zpData?.autoChatResult ??
          data?.zpData?.openResult ??
          data?.zpData?.result ??
          data?.zpData?.success ??
          data?.message === "Success";
        if (ok === false) {
          attempts.push(`${item.path} → code=0 但业务结果为失败 | body=${bodyPreview}`);
          continue;
        }
        return { ok: true, path: item.path, data };
      } catch (err) {
        attempts.push(`${item.path} → 请求异常: ${err.message}`);
      }
    }
    // 所有候选接口均未成功：把每个尝试的完整结果打到日志区（页面内的 <div>，非 DevTools），
    // 复制这段内容即可帮助定位真正的接口地址，不需要打开调试工具
    log(`追聊候选接口均未生效，详情如下（可直接复制反馈）：\n${attempts.join("\n")}`, "warn");
    return { ok: false };
  }

  /**
   * 独立的「探测追聊接口」入口：无需真正打招呼，直接对最近一次成功打招呼的职位
   * 重新尝试所有候选接口并把完整结果打到日志区，用于诊断，全程不需要打开 DevTools。
   */
  async function probeBossAutoChatEndpoints() {
    if (!lastGreetedBossJob?.securityId) {
      showToast("还没有成功打过招呼的职位，先正常打一次招呼再探测", "warn");
      return;
    }
    log(
      `开始探测追聊接口（目标：${lastGreetedBossJob.brandName || ""} · ${lastGreetedBossJob.jobName || ""}）…`,
      "info",
    );
    const result = await tryEnableBossAutoFollowViaApi(
      lastGreetedBossJob.securityId,
    );
    if (result.ok) {
      log(`探测成功，命中接口：${result.path}`, "success");
      showToast(`探测成功：${result.path}`, "success", 6000);
    } else {
      showToast("探测完成，均未成功，详情见运行日志", "warn", 6000);
    }
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
    // 当前 PC 站的成功提示有专用容器，优先识别，避免选中外围遮罩。
    for (const wrapper of document.querySelectorAll(".el-dialog__wrapper.success-popup")) {
      const dialog = wrapper.querySelector(".el-dialog");
      if (dialog && isVisibleEl(wrapper) && isVisibleEl(dialog) && /投递成功/.test(dialog.textContent || "")) return dialog;
    }
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

  /** 关闭入口可能是内容框的兄弟节点，只匹配有关闭语义且靠近右上角的元素。 */
  function findCloseButtonInPopup(popup) {
    if (!popup) return null;
    const wrapper = popup.closest(".el-dialog__wrapper.success-popup");
    const exactClose = wrapper?.querySelector('.el-dialog__body > img.close-button[role="button"]');
    if (exactClose && isVisibleEl(exactClose)) return exactClose;
    const selector = '[aria-label="Close"], [aria-label="关闭"], [title="关闭"], [class*="close"], [class*="Close"], [class*="cross"], img[alt="关闭"]';
    const candidates = new Set([...popup.querySelectorAll(selector), ...document.querySelectorAll(selector)]);
    // 文本 × 也可能没有 class。
    for (const el of document.querySelectorAll("button, a, i, span")) {
      if (/^[×✕✖]$/.test((el.textContent || "").trim())) candidates.add(el);
    }
    const rect = popup.getBoundingClientRect();
    const ranked = [];
    for (const el of candidates) {
      if (el.closest("#bag-panel, #bag-fab") || !isVisibleEl(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 80 || r.height > 80) continue;
      const distance = Math.hypot((r.left + r.right) / 2 - rect.right, (r.top + r.bottom) / 2 - rect.top);
      if (!popup.contains(el) && distance > 110) continue;
      ranked.push({ el, distance });
    }
    ranked.sort((a, b) => a.distance - b.distance);
    return ranked[0]?.el || null;
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
      if (findJob51SuccessPopup()) return;
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
    const deadline = Date.now() + maxWaitMs;
    let popup = findJob51SuccessPopup();
    while (!popup && Date.now() < deadline) {
      await sleep(300);
      popup = findJob51SuccessPopup();
    }
    if (!popup) return { confirmed: false, closed: true };
    log("已确认投递成功，尝试关闭提示弹窗…", "info");
    // 最多尝试三次，不移除网站 DOM，不反复点击遮罩。
    for (let attempt = 0; attempt < 3; attempt++) {
      popup = findJob51SuccessPopup();
      if (!popup) return { confirmed: true, closed: true };
      const closeBtn = findCloseButtonInPopup(popup);
      if (closeBtn) {
        // 关闭图标本身绑定 click；只触发一次，避免 safeClick 的双重点击与滚动。
        if (typeof closeBtn.click === "function") closeBtn.click();
        else closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
      else if (attempt === 0) {
        popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      } else break;
      for (let wait = 0; wait < 4; wait++) {
        await sleep(200);
        if (!findJob51SuccessPopup()) return { confirmed: true, closed: true };
      }
    }
    return { confirmed: true, closed: !findJob51SuccessPopup() };
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
    if (findJob51SuccessPopup()) {
      const previous = await handleJob51SuccessPopup(0);
      if (!previous.closed) throw new Error("成功弹窗未关闭，请手动关闭后再开始");
    }
    let card = await ensureJob51CardVisible(job);
    if (!card) {
      throw new Error("当前页面未找到该职位，请确认在搜索结果页且页面已加载");
    }
    const applyBtn = findJob51ApplyButton(card);
    if (!applyBtn) throw new Error("未找到投递按钮（可能已投递）");
    safeClick(applyBtn);
    await sleep(1200);
    if (cfg.customGreetingEnabled && cfg.greeting.trim()) await tryCustomGreeting(job, cfg);
    // 确认投递后关闭成功弹窗。
    await handleJob51ApplyConfirmPopup();
    const popupResult = await handleJob51SuccessPopup();
    if (!popupResult.confirmed) throw new Error("未确认投递结果，请在网页核实后再开始");
    return { success: true, popupBlocked: !popupResult.closed };
  }

  async function tryCustomGreeting(job, cfg) {
    const text = cfg.greeting.replace(/\{jobName\}/g, job.jobName || "")
      .replace(/\{company\}/g, job.brandName || "")
      .replace(/\{salary\}/g, job.salaryDesc || "").replace(/\\n/g, "\n");
    try {
      await sleep(800);
      if (platform === "boss") {
        const dialog = document.querySelector(".greet-boss-dialog");
        const vue = dialog?.__vue__;
        const field = vue && ["greetContent", "content", "message"].find((key) => key in vue);
        const submit = vue && (vue.submitAction || vue.confirmAction);
        if (!dialog || !isVisibleEl(dialog) || !field || typeof submit !== "function") {
          log("未找到可用的自定义招呼弹窗，本次未发送自定义内容", "warn");
          return;
        }
        vue[field] = text;
        await submit.call(vue);
        log("已尝试提交自定义招呼，实际送达请在网站消息中核实", "info");
      } else {
        const textarea = [...document.querySelectorAll('.van-popup textarea, .el-dialog textarea, .el-message-box textarea, textarea[placeholder*="附言"], textarea[placeholder*="留言"]')]
          .find((el) => isVisibleEl(el) && !el.disabled && !el.readOnly && !el.closest("#bag-panel"));
        if (!textarea) {
          log("投递弹窗没有可用的附言框，本次未填写自定义内容", "warn");
          return;
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) setter.call(textarea, text);
        else textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        log("已填写投递附言，实际提交结果以网站为准", "info");
      }
    } catch {
      log("自定义内容处理失败，继续正常投递；请在网站核实", "warn");
    }
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
      ...parseJobsFromDOM(),
      ...(getVueJobList() || []),
      ...capturedJobs,
    ];
    sources.forEach((job) => upsertJob(map, job));
    return [...map.values()];
  }

  function hookNetworkForJobs() {
    if (window.__bagNetworkHooked__) return;
    window.__bagNetworkHooked__ = true;

    const jobApiPattern =
      platform === "job51"
        ? /search-pc|job\/search|deliver|apply|resume/i
        : /\/wapi\//i;

    const handleJobResponse = (url, text) => {
      if (!jobApiPattern.test(url)) return;
      try {
        if (platform === "boss" && new URL(url, location.origin).origin !== location.origin) return;
        captureDiagnostics.responses++;
        try { captureDiagnostics.lastPath = new URL(url, location.origin).pathname; } catch { captureDiagnostics.lastPath = "无法解析路径"; }
        const data = JSON.parse(text);
        captureDiagnostics.shape = [data, data?.zpData, data?.data].map((part) =>
          part && typeof part === "object" ? Object.keys(part).slice(0, 15).join(",") : typeof part).join(" / ");
        const list = extractJobsFromApiData(data);
        captureDiagnostics.candidates += list.length;
        if (list.length) ingestJobList(list, "接口");
      } catch {
        captureDiagnostics.parseErrors++;
      }
    };

    const origFetch = window.fetch;
    const hookedFetch = async function (...args) {
      captureDiagnostics.observed++;
      const resp = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0]?.url || "";
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
      captureDiagnostics.observed++;
      this._bagUrl = String(url);
      return origOpen.call(this, method, url, ...rest);
    };
    patchedOpen.toString = () => origOpen.toString();
    XMLHttpRequest.prototype.open = patchedOpen;

    const patchedSend = function (...args) {
      this.addEventListener("load", function () {
        try {
          const text = this.responseType === "json" ? JSON.stringify(this.response)
            : (!this.responseType || this.responseType === "text") ? this.responseText : "";
          handleJobResponse(this._bagUrl || "", text);
        } catch { /* 不影响网页请求 */ }
      }, { once: true });
      return origSend.apply(this, args);
    };
    patchedSend.toString = () => origSend.toString();
    XMLHttpRequest.prototype.send = patchedSend;
    networkHookStatus = () => `fetch ${window.fetch === hookedFetch ? "有效" : "已被替换"} / XHR ${XMLHttpRequest.prototype.open === patchedOpen && XMLHttpRequest.prototype.send === patchedSend ? "有效" : "已被替换"}`;
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
    const geoOverrides = buildBossGeoOverrides(cfg);

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
              ...geoOverrides,
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

  /** 从配置读取商圈/地铁线路参数，统一注入到搜索请求中 */
  function buildBossGeoOverrides(cfg) {
    const overrides = {};
    const districts = splitKeywords(cfg?.searchBusinessDistricts || "").join(",");
    const subways = splitKeywords(cfg?.searchSubwayLines || "").join(",");
    if (districts) overrides.multiBusinessDistrict = districts;
    if (subways) overrides.multiSubway = subways;
    return overrides;
  }

  async function fetchBossSingleQueryPages(maxPages = 5) {
    if (bossEnvBlocked) {
      await fetchBossJobsViaPagePagination(maxPages);
      return;
    }
    const geoOverrides = buildBossGeoOverrides(loadConfig());
    log(`单关键词拉取，最多 ${maxPages} 页…`, "info");
    for (let page = 1; page <= maxPages; page++) {
      const { list, hasMore, envBlocked } = await fetchBossJobsFromSearchApi(
        page,
        geoOverrides,
      );
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
    if (platform === "boss") {
      await collectBossJobsFromPageOnly("当前页");
      // 开始已包含手动采集动作；给网页尚在完成的正常请求留出时间。
      const deadline = Date.now() + Math.min(maxWaitMs, 5000);
      let jobs = mergeJobs();
      while (!jobs.some((job) => job.securityId) && Date.now() < deadline) {
        await sleep(500);
        jobs = mergeJobs();
      }
      return jobs;
    }
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

  async function loadNextBossPage() {
    const generation = runGeneration;
    const active = () => state.running && generation === runGeneration && !bossEnvBlocked;
    const cfg = loadConfig();
    const known = new Set(state.jobs.map(jobKey));
    const appendFresh = () => {
      const fresh = mergeJobs().filter((job) => job.securityId && !known.has(jobKey(job)));
      if (!fresh.length) return false;
      state.jobs.push(...fresh);
      log(`新增 ${fresh.length} 个完整职位，继续处理`, "success");
      return true;
    };
    if (!active()) return false;
    if (appendFresh()) return true;
    if (!cfg.autoNextPage) { log("自动翻页已关闭", "info"); return false; }
    if (cfg.maxFetchPages > 0 && state.pagesLoaded >= cfg.maxFetchPages) {
      log(`已达本次页数上限 ${cfg.maxFetchPages}`, "warn");
      return false;
    }
    // 只点击分页控件，不匹配全站 next/more 链接。
    const candidates = [...document.querySelectorAll('.options-pages a, .pagination a, .pagination button, .ui-pagination a, .ui-pagination button, button[aria-label="下一页"], a[aria-label="下一页"]')];
    const next = candidates.find((el) => isVisibleEl(el) &&
      !el.closest('.disabled, [disabled], [aria-disabled="true"]') &&
      (/^(下一页|下页|›|»|>)$/.test(el.textContent.trim()) || el.matches('.next, [aria-label="下一页"]') || el.querySelector('.ui-icon-arrow-right')));
    log(next ? "当前页已处理完，等待后自动翻页…" : "当前批次已处理完，等待后滚动加载更多…", "info");
    await sleep(Math.max(8, Number(cfg.delayMin) || 8) * 1000);
    if (!active()) return false;
    if (next) {
      // 常规分页由网站处理；遇到整页导航不会跨刷新自动恢复任务。
      safeClick(next);
    } else {
      const container = getJobListContainer();
      if (container) container.scrollTop = container.scrollHeight;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }
    const deadline = Date.now() + 12000;
    while (active() && Date.now() < deadline) {
      await sleep(500);
      if (!active()) return false;
      if (appendFresh()) { state.pagesLoaded++; updateStats(); return true; }
    }
    if (active()) {
      log("翻页后未取得新的完整职位，已停止，避免反复翻页或空跑", "warn");
      logCaptureDiagnostics();
    }
    return false;
  }

  async function loadMoreJobsIfNeeded() {
    if (platform === "boss" && bossEnvBlocked) return false;
    if (state.index < state.jobs.length) return true;
    if (platform === "boss") return loadNextBossPage();
    const cfg = loadConfig();
    const currentPageCount = Math.ceil(state.jobs.length / 30) || 1;
    const nextPage = currentPageCount + 1;
    const maxPages = cfg.maxFetchPages === 0 ? Infinity : cfg.maxFetchPages * 2;

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

  // 使用岗位城市字段，绝不以公司名称或当前搜索页城市推断工作地点。
  function checkBossCityFilter(job, cfg) {
    const known = BOSS_CITY_PRESETS;
    const normalize = (name) => String(name || "").trim().replace(/市$/, "");
    const entries = String(cfg.searchCities || "").split(/[,，、;；\s]+/).filter(Boolean);
    if (!entries.length) return "未设置目标城市，请先填写投递城市";
    const targets = entries.map((entry) => {
      const parts = entry.split(/[:：]/);
      const name = normalize(parts[0]);
      if (parts.length === 2) return /^\d{9}$/.test(parts[1]) ? { name, code: parts[1] } : null;
      if (/^\d{9}$/.test(entry)) return { code: entry, name: Object.keys(known).find((key) => known[key] === entry) || "" };
      return /^[\u4e00-\u9fff]+$/.test(name) ? { name, code: known[name] || "" } : null;
    });
    if (targets.some((target) => !target)) return "目标城市配置格式错误，请使用城市名称或名称:9位代码";
    if (targets.some((target) => target.code === "100010000")) return null;
    const rawCode = job.cityCode ?? job.city ?? job.jobInfo?.cityCode ?? job.jobInfo?.city;
    const code = /^\d{9}$/.test(String(rawCode || "")) ? String(rawCode) : "";
    const name = normalize(job.cityName || job.jobInfo?.cityName ||
      (typeof rawCode === "string" && /^[\u4e00-\u9fff]+$/.test(rawCode) ? rawCode : ""));
    if (!code && !name) return "岗位工作城市未知，跳过以避免异地投递";
    const matched = targets.some((target) => {
      if (code && target.code) return code === target.code;
      return !!name && !!target.name && name === target.name;
    });
    return matched ? null : `工作城市 ${name || code} 不在目标城市（${entries.join("、")}）`;
  }

  function shouldSkip(job, cfg, greetedSet) {
    const jobName = job.jobName || "";
    const titleText = `${jobName} ${job.brandName || ""}`;
    if (platform === "boss") {
      const cityReason = checkBossCityFilter(job, cfg);
      if (cityReason) return cityReason;
    }

    // Boss 打招呼强依赖 securityId，缺失的多为 DOM 残缺数据，直接跳过而非失败
    if (platform === "boss" && !job.securityId)
      return "缺少 securityId（DOM 残缺数据，无法打招呼）";

    // 手动添加的职位是用户明确挑选的（如 App 端看到的独占岗位），跳过黑白名单/薪资等内容过滤，
    // 仅保留「已打招呼」去重，避免重复打扰同一职位
    if (job.manualAdd) {
      if (cfg.skipGreeted && greetedSet.has(jobKey(job)))
        return `已${meta.actionVerb}过`;
      return null;
    }

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

    const rangeMin = cfg.salaryRangeMin;
    const rangeMax = cfg.salaryRangeMax;
    if (rangeMax > 0 && rangeMin > rangeMax) return "薪资区间配置错误：最低值不能大于最高值";
    if (rangeMin > 0 || rangeMax > 0) {
      const salary = parseSalaryRange(job.salaryDesc, true);
      if (!Number.isFinite(salary.min) || !Number.isFinite(salary.max) ||
          salary.min <= 0 || salary.max < salary.min || /[\uE000-\uF8FF]/.test(job.salaryDesc || "")) {
        return "薪资未公开或无法识别，不能确认与目标区间重叠";
      }
      // 两个闭区间有交集即可，0 表示该端不限制。
      if (salary.max < rangeMin || (rangeMax > 0 && salary.min > rangeMax)) {
        return `岗位薪资 ${job.salaryDesc} 与目标 ${rangeMin}–${rangeMax || "不限"}K 无重叠`;
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

  async function processNext(generation = runGeneration) {
    if (!state.running || generation !== runGeneration) return;
    const cfg = loadConfig();
    const greetedSet = loadGreetedSet();

    if (cfg.maxCount > 0 && state.success >= cfg.maxCount) {
      log(`已达本次上限 ${cfg.maxCount} 条，自动停止`, "warn");
      stopRun();
      return;
    }

    if (state.index >= state.jobs.length) {
      const hasMore = await loadMoreJobsIfNeeded();
      if (!state.running || generation !== runGeneration) return;
      if (!hasMore) {
        log("所有职位已处理完毕", "success");
        stopRun();
        return;
      }
    }

    const job = state.jobs[state.index];
    state.index++;
    updateStats();

    const label = `${job.brandName || ""} · ${job.jobName || ""}${platform === "boss" ? `（工作城市：${job.cityName || job.cityCode || job.city || "未知"}）` : ""}`;
    const skipReason = shouldSkip(job, cfg, greetedSet);

    if (skipReason) {
      log(`跳过：${label}（${skipReason}）`, "warn");
      state.skip++;
      updateStats();
      await randomDelay(cfg.delayMin, cfg.delayMax);
      processNext(generation);
      return;
    }

    if (cfg.skipInactive) {
      const active = await checkJobActive(job);
      if (!state.running || generation !== runGeneration) return;
      if (!active) {
        log(`跳过：${label}（职位/HR 不活跃）`, "warn");
        state.skip++;
        updateStats();
        await randomDelay(cfg.delayMin, cfg.delayMax);
        processNext(generation);
        return;
      }
    }

    try {
      log(`${meta.actionVerb}：${label}`, "info");
      const result = await greetJob(job, cfg);
      greetedSet.add(jobKey(job));
      saveGreetedSet(greetedSet);
      state.success++;
      log(`成功：${label}`, "success");
      if (result?.popupBlocked) {
        log("本条投递已成功，但弹窗未关闭；已暂停后续投递，请手动点击右上角 × 后再开始", "warn");
        stopRun();
        return;
      }
    } catch (err) {
      if (platform === "job51" && /成功弹窗未关闭|未确认投递结果/.test(err.message)) {
        log(err.message, "warn");
        stopRun();
        return;
      }
      const softSkip =
        platform === "boss"
          ? /开聊提醒|开聊|已沟通|重复|不可重复/i.test(err.message)
          : /已投递|已申请|重复|上限|次数/i.test(err.message);
      if (softSkip) {
        log(`跳过：${label}（${err.message}）`, "warn");
        state.skip++;
        updateStats();
        await randomDelay(cfg.delayMin, cfg.delayMax);
        processNext(generation);
        return;
      }
      state.fail++;
      log(`失败：${label} — ${err.message}`, "error");
      if (platform === "boss" && (bossEnvBlocked || /超时|网络请求失败|响应解析失败/.test(err.message))) {
        log("请求已暂停，请确认网页上的沟通结果后再操作", "warn");
        stopRun();
        return;
      }
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
    processNext(generation);
  }

  async function startRun() {
    if (state.running) return;
    if (platform === "boss") {
      bossBlockedUntil = Number(localStorage.getItem(BOSS_BLOCK_KEY)) || 0;
      if (bossBlockedUntil > Date.now()) {
        showToast(`平台限制暂停中，请在 ${new Date(bossBlockedUntil).toLocaleTimeString()} 后确认网页正常再手动启动`, "warn", 6000);
        return;
      }
      bossEnvBlocked = false;
    }
    const generation = ++runGeneration;
    readPanelConfig();
    const salaryConfig = loadConfig();
    if (salaryConfig.salaryRangeMax > 0 && salaryConfig.salaryRangeMin > salaryConfig.salaryRangeMax) {
      showToast("薪资区间最低值不能大于最高值，请修改后开始", "warn", 5000);
      return;
    }

    const startBtn = document.getElementById("bag-start");
    const stopBtn = document.getElementById("bag-stop");
    if (startBtn) startBtn.disabled = true;

    log("正在扫描职位列表，请稍候…", "info");
    showToast("正在扫描职位列表…", "info", 3000);

    state.jobs = await scanAndCollectJobs();
    if (generation !== runGeneration) return;

    if (platform === "boss") {
      const total = state.jobs.length;
      state.jobs = state.jobs.filter((job) => job.securityId && job.jobName && (job.encryptJobId || job.encryptId));
      log(`采集到 ${total} 个职位，其中完整数据 ${state.jobs.length} 个`, "info");
      if (!state.jobs.length) {
        logCaptureDiagnostics();
        log("采集失败，任务未启动。请提供上方两条采集诊断日志，确认是响应监听还是字段解析失败。", "warn");
        showToast("职位数据采集失败，请查看运行日志中的采集诊断", "warn", 8000);
        if (startBtn) startBtn.disabled = false;
        return;
      }
    }
    if (!state.jobs.length) {
      const cfg = loadConfig();
      const hint =
        platform === "boss" && cfg.multiKeywordSearch
          ? "未找到职位：请确认已登录，并手动打开职位列表等待卡片加载"
          : "未找到职位：请确认页面已加载出职位卡片（非「加载中」状态）";
      log(hint, "error");
      showToast(hint, "error", 8000);
      if (startBtn) startBtn.disabled = false;
      return;
    }

    state.running = true;
    state.pagesLoaded = 1;
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
    if (platform === "boss") {
      await collectBossJobsFromPageOnly("当前页");
      showToast("已采集当前页职位；更多职位请手动使用网页筛选和翻页", "info", 5000);
      updateStats();
      return;
    }
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
    runGeneration++;
    state.running = false;
    const startBtn = document.getElementById("bag-start");
    const stopBtn = document.getElementById("bag-stop");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    updateStats();
    log("已停止", "warn");
  }

  function clearGreetedHistory() {
    localStorage.removeItem(GREETED_KEY);
    log(`已清空${meta.actionVerb}记录`, "info");
  }

  // ---------- UI ----------

  function readPanelConfig() {
    const cfg = {
      customGreetingEnabled: document.getElementById("bag-custom-greeting-enabled")?.checked === true,
      greeting: document.getElementById("bag-greeting")?.value ?? DEFAULT_CONFIG.greeting,
      autoNextPage: document.getElementById("bag-auto-next")?.checked ?? true,
      salaryRangeMin: Math.max(0, Number(document.getElementById("bag-salary-range-min")?.value) || 0),
      salaryRangeMax: Math.max(0, Number(document.getElementById("bag-salary-range-max")?.value) || 0),
      maxCount: parseRunLimit(document.getElementById("bag-max-count")?.value, DEFAULT_CONFIG.maxCount),
      maxFetchPages: parseRunLimit(document.getElementById("bag-max-fetch-pages")?.value, DEFAULT_CONFIG.maxFetchPages),
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
      multiKeywordSearch: false,
      pagesPerKeyword: DEFAULT_CONFIG.pagesPerKeyword,
      bossAutoFollowChat:
        platform === "boss"
          ? (document.getElementById("bag-boss-auto-follow")?.checked ?? true)
          : false,
      searchBusinessDistricts: "",
      searchSubwayLines: "",
    };
    saveConfig(cfg);
    return cfg;
  }

  /** 解析 App 上复制来的职位链接/ID，提取 encryptJobId / securityId / lid */
  function parseBossJobUrl(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    let encryptJobId = "";
    let securityId = "";
    let lid = "";
    try {
      const url = new URL(raw, location.origin);
      encryptJobId = url.pathname.match(/job_detail\/([^/?#.]+)/)?.[1] || "";
      securityId = url.searchParams.get("securityId") || "";
      lid = url.searchParams.get("lid") || "";
    } catch {
      // 不是完整 URL，视为直接粘贴的 encryptJobId
      encryptJobId = raw.match(/^[\w-]+$/) ? raw : "";
    }
    if (!encryptJobId) return null;
    return { encryptJobId, encryptId: encryptJobId, securityId, lid };
  }

  /** 手动添加 App 端发现的职位到打招呼队列（PC/App 桥接，绕开推荐算法差异） */
  function addManualBossJob() {
    const input = document.getElementById("bag-manual-job-input");
    const parsed = parseBossJobUrl(input?.value);
    if (!parsed) {
      showToast("无法识别职位链接/ID，请检查格式", "error");
      return;
    }
    if (!parsed.securityId) {
      log(
        "该链接缺少 securityId 参数，可能无法打招呼；建议在浏览器打开该职位详情页后，直接复制地址栏完整链接",
        "warn",
      );
    }
    ingestJobList([{ ...parsed, jobName: "（手动添加）", manualAdd: true }], "手动添加");
    state.jobs = mergeJobs();
    updateStats();
    if (input) input.value = "";
    showToast("已添加到队列，点「开始」即可处理", "success");
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
      panel.style.left = `${Math.max(8, Math.min(e.clientX - offsetX, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(e.clientY - offsetY, window.innerHeight - panel.offsetHeight - 8))}px`;
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
        width: 340px; max-width: calc(100vw - 24px); max-height: calc(100vh - 96px); overflow: hidden; display: flex; flex-direction: column;
        background: #fff; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.18);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #333;
      }
      #bag-panel * { box-sizing: border-box; }
      #bag-panel .bag-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; color: #fff; flex-shrink: 0;
        border-radius: 10px 10px 0 0; cursor: move; user-select: none;
      }
      #bag-panel .bag-header h3 { margin: 0; font-size: 14px; }
      #bag-panel .bag-toggle {
        background: rgba(255,255,255,.2); border: none; color: #fff;
        border-radius: 4px; padding: 2px 8px; cursor: pointer;
      }
      #bag-panel .bag-body {
        padding: 12px 14px; display: block; min-height: 0; overflow-y: auto; overflow-x: hidden;
        overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #bccfcb transparent;
      }
      #bag-panel .bag-body::-webkit-scrollbar, #bag-panel #bag-log::-webkit-scrollbar { width: 6px; height: 6px; }
      #bag-panel .bag-body::-webkit-scrollbar-track, #bag-panel #bag-log::-webkit-scrollbar-track { background: transparent; }
      #bag-panel .bag-body::-webkit-scrollbar-thumb, #bag-panel #bag-log::-webkit-scrollbar-thumb {
        background: #bccfcb; border-radius: 10px;
      }
      #bag-panel .bag-body::-webkit-scrollbar-thumb:hover, #bag-panel #bag-log::-webkit-scrollbar-thumb:hover { background: #8caea7; }
      #bag-panel #bag-log { scrollbar-width: thin; scrollbar-color: #bccfcb transparent; overscroll-behavior: contain; }
      #bag-panel[hidden], #bag-fab[hidden] { display: none !important; }
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
      #bag-panel #bag-clear {
        appearance: none; display: inline-flex; align-items: center; justify-content: center;
        width: 100%; min-height: 40px; margin-top: 12px; padding: 8px 14px;
        border: 1px solid #efcaca; border-radius: 8px;
        background: #fff5f5; color: #a33333;
        font: inherit; font-size: 13px; font-weight: 500; line-height: 1.4;
        box-shadow: none; cursor: pointer;
        transition: background-color .15s, border-color .15s;
      }
      #bag-panel #bag-clear:hover { background: #ffe8e8; border-color: #dca2a2; }
      #bag-panel #bag-clear:active { background: #ffdddd; }
      #bag-panel #bag-clear:focus-visible { outline: 2px solid #a33333; outline-offset: 3px; }
      #bag-refresh { background: #1677ff; color: #fff; flex: 0 0 auto; padding: 8px 10px; font-size: 12px; }
      #bag-panel #bag-copy-log { width: 100%; margin-top: 8px; padding: 8px 12px; border: 1px solid #cbdedb; border-radius: 8px; background: #f4faf9; color: #375b56; font: inherit; cursor: pointer; }
      #bag-panel #bag-copy-log:hover { background: #e6f1ef; }
      #bag-panel #bag-copy-log:focus-visible { outline: 2px solid #16766e; outline-offset: 2px; }
      #bag-panel #bag-stats { font-size: 11px; color: #666; margin-bottom: 8px; white-space: normal; overflow-wrap: anywhere; line-height: 1.7; font-variant-numeric: tabular-nums; }
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
      #bag-panel .bag-step { border-bottom: 1px solid #e8eeee; padding: 0 0 16px; margin: 0 0 16px; }
      #bag-panel .bag-step h4 { margin: 0 0 12px; font-size: 14px; color: #16766e; }
      #bag-panel .bag-advanced summary { cursor: pointer; padding: 10px 0; color: #666; font-weight: 600; }
      #bag-panel #bag-city-picker { position: relative; width: 100%; margin-bottom: 8px; }
      #bag-panel #bag-city-summary { display: block; list-style: none; position: relative; padding: 8px 28px 8px 10px; border: 1px solid #cbdedb; border-radius: 6px; background: #fff; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
      #bag-panel #bag-city-summary::-webkit-details-marker { display: none; }
      #bag-panel #bag-city-summary::after { content: "▾"; position: absolute; right: 10px; }
      #bag-panel #bag-city-picker[open] > summary::after { content: "▴"; }
      #bag-panel .bag-city-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5; max-height: 260px; overflow-y: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid #cbdedb; border-radius: 8px; background: #fff; box-shadow: 0 6px 18px #0002; scrollbar-width: thin; }
      #bag-panel .bag-city-custom summary { cursor: pointer; font-size: 12px; padding: 8px 0; color: #667b76; }
      #bag-panel #bag-city-summary:focus-visible { outline: 2px solid #16766e; outline-offset: 2px; }
      #bag-panel #bag-hot-cities { margin: 0; }
      #bag-panel #bag-hot-cities .bag-tip { width: 100%; }
      #bag-panel #bag-hot-cities button { padding: 5px 10px; border: 1px solid #cbdedb; border-radius: 6px; background: #fff; color: #375b56; cursor: pointer; }
      #bag-panel #bag-search-cities { min-height: 58px; line-height: 1.6; }
      #bag-panel .bag-city-heading { width: 100%; font-size: 12px; font-weight: 600; color: #375b56; margin: 4px 0; }
      #bag-panel .bag-city-grid { display: flex; flex-direction: column; width: 100%; }
      #bag-panel .bag-city-option { margin: 0; min-height: 34px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 4px; background: #fff; font-weight: 400; cursor: pointer; }
      #bag-panel .bag-city-code { margin-left: auto; color: #84918d; font-size: 11px; font-variant-numeric: tabular-nums; }
      #bag-panel .bag-city-option:hover { background: #f0f7f5; }
      #bag-panel .bag-city-option[data-selected="true"] { background: #e4f6f1; border-color: #00a99e; color: #006b63; }
      #bag-panel .bag-city-option input { margin: 0; accent-color: #009e93; cursor: pointer; }
      #bag-panel .bag-city-option:focus-within { outline: 2px solid #16766e; outline-offset: -2px; }
      #bag-panel #bag-city-switches { border-top: 1px solid #e4ecea; padding-top: 12px; margin-top: 12px !important; }
      #bag-panel #bag-city-switches button { padding: 5px 10px; border: 1px solid #cbdedb; border-radius: 6px; background: #f4faf9; cursor: pointer; }
      #bag-panel .bag-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      #bag-panel #bag-deep-search, #bag-panel #bag-refresh { background: #eef4f3 !important; color: #375b56 !important; }
      @keyframes bag-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      #bag-fab { transition: box-shadow .15s, background-color .15s; }
      #bag-fab:hover { filter: brightness(.96); }
      #bag-fab:focus-visible { outline: 3px solid #16766e; outline-offset: 3px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setPanelOpen(open) {
    panelOpen = open;
    const panel = document.getElementById("bag-panel");
    const fab = document.getElementById("bag-fab");
    if (panel) panel.hidden = !open;
    if (fab) {
      fab.hidden = open;
      fab.setAttribute("aria-expanded", String(open));
    }
  }

  function makeFabDraggable(fab) {
    let drag = null;
    let suppressClick = false;
    const moveTo = (left, top) => {
      const rect = fab.getBoundingClientRect();
      fab.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`;
      fab.style.top = `${Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))}px`;
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    };
    fab.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      const rect = fab.getBoundingClientRect();
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false };
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      fab.style.cursor = "grabbing";
      moveTo(drag.left + dx, drag.top + dy);
    });
    const finish = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      suppressClick = drag.moved;
      drag = null;
      fab.style.cursor = "grab";
      if (fab.hasPointerCapture(e.pointerId)) fab.releasePointerCapture(e.pointerId);
    };
    fab.addEventListener("pointerup", finish);
    fab.addEventListener("pointercancel", finish);
    fab.addEventListener("lostpointercapture", finish);
    window.addEventListener("resize", () => {
      if (!fab.hidden && fab.style.left) {
        const rect = fab.getBoundingClientRect();
        moveTo(rect.left, rect.top);
      }
    });
    return (e) => {
      const skip = suppressClick && e.detail !== 0;
      suppressClick = false;
      return skip;
    };
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
      padding: "10px 16px",
      background: meta.theme,
      color: "#fff",
      border: "2px solid #fff",
      borderRadius: "24px",
      cursor: "grab",
      touchAction: "none",
      userSelect: "none",
      fontSize: "14px",
      fontWeight: "600",
      boxShadow: "0 4px 14px rgba(0,0,0,.14)",
    });
    const consumeDragClick = makeFabDraggable(fab);
    fab.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (consumeDragClick(e)) return;
      if (!document.getElementById("bag-panel")) createPanel();
      setPanelOpen(true);
      document.getElementById("bag-collapse")?.focus();
    });
    fab.type = "button";
    fab.setAttribute("aria-controls", "bag-panel");
    fab.setAttribute("aria-expanded", String(panelOpen));
    fab.hidden = panelOpen;
    getMountRoot().appendChild(fab);
  }

  function arrangePanelBySteps(panel) {
    const body = panel.querySelector(".bag-body");
    const original = [...body.children];
    const section = (title) => {
      const el = document.createElement("section");
      el.className = "bag-step";
      const heading = document.createElement("h4");
      heading.textContent = title;
      el.appendChild(heading);
      return el;
    };
    const search = section("1 · 设置搜索与目标城市");
    if (platform === "job51") {
      const tip = document.createElement("p");
      tip.className = "bag-tip";
      tip.textContent = "请在网页上方「工作地点」手动选择城市，再点击网页「搜索」。51job 的城市选择不一定显示在地址栏，插件暂不代选城市；深度搜岗暂不能保证沿用网页城市筛选，请核对职位工作地点。";
      search.appendChild(tip);
    }
    const filters = section("2 · 设置岗位筛选");
    const settings = section("3 · 设置投递节奏");
    const run = section("4 · 采集并开始");
    const result = section("5 · 查看进度与日志");
    const moveField = (id, target) => {
      const input = panel.querySelector(`#${id}`);
      if (!input) return;
      if (input.parentElement.matches("label")) {
        target.appendChild(input.parentElement);
      } else if (input.parentElement.parentElement?.classList.contains("bag-row")) {
        target.appendChild(input.parentElement);
      } else {
        const label = input.previousElementSibling;
        if (label?.matches("label")) target.appendChild(label);
        target.appendChild(input);
      }
    };
    ["bag-search-keywords", "bag-city-picker"].forEach((id) => moveField(id, search));
    const cities = panel.querySelector("#bag-city-switches");
    if (cities) {
      const tip = cities.nextElementSibling;
      search.appendChild(cities);
      if (tip?.classList.contains("bag-tip")) search.appendChild(tip);
    }
    ["bag-salary-range", "bag-whitelist", "bag-blacklist",
      "bag-job51-guoqi", "bag-job51-yangqi", "bag-job51-waiqi",
      "bag-exclude-outsourcing", "bag-skip-inactive", "bag-skip-greeted"].forEach((id) => moveField(id, filters));
    ["bag-custom-greeting", "bag-max-count", "bag-max-fetch-pages", "bag-auto-next", "bag-delay-min", "bag-delay-max", "bag-boss-auto-follow"].forEach((id) => moveField(id, settings));
    const help = document.createElement("p");
    help.className = "bag-tip";
    help.textContent = "配置会自动保存。网页职位加载后，点击采集并开始；也可先单独采集。";
    run.appendChild(help);
    const actions = panel.querySelector(".bag-actions");
    const clear = panel.querySelector("#bag-clear");
    clear.remove();
    run.appendChild(actions);
    actions.querySelector("#bag-start").textContent = "采集并开始";
    actions.querySelector("#bag-deep-search").textContent = platform === "boss" ? "仅采集职位" : "深度搜岗";
    actions.querySelector("#bag-refresh").textContent = "刷新列表";
    result.appendChild(panel.querySelector("#bag-stats"));
    moveField("bag-log", result);
    const copyLog = document.createElement("button");
    copyLog.id = "bag-copy-log";
    copyLog.type = "button";
    copyLog.textContent = "复制运行日志";
    copyLog.addEventListener("click", async () => {
      const lines = [...result.querySelectorAll(".bag-log-line")].reverse().map((line) => line.textContent);
      const text = [`${meta.label}助手 v${SCRIPT_VERSION}`, result.querySelector("#bag-stats")?.title || "", ...lines].join("\n");
      try {
        await navigator.clipboard.writeText(text);
        showToast("运行日志已复制", "success", 2500);
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(result.querySelector("#bag-log"));
        selection?.removeAllRanges();
        selection?.addRange(range);
        showToast("浏览器未允许复制，已选中日志，请手动复制", "warn", 4000);
      }
    });
    result.appendChild(copyLog);
    const advanced = document.createElement("details");
    advanced.className = "bag-advanced";
    const summary = document.createElement("summary");
    summary.textContent = "诊断与记录管理";
    advanced.appendChild(summary);
    // 低频诊断和记录管理统一收起。
    for (const node of original) {
      if (node.parentElement !== body) continue;
      if (node.classList.contains("bag-row") && !node.children.length) { node.remove(); continue; }
      advanced.appendChild(node);
    }
    advanced.appendChild(clear);
    body.append(search, filters, settings, run, result, advanced);
  }

  function createPanel() {
    if (document.getElementById("bag-panel")) return;
    const cfg = loadConfig();
    ensureBagStyles();

    const bossSearchSection =
      platform === "boss"
        ? `
        <label>备用搜索关键词（逗号分隔，切换城市时使用首词）</label>
        <input type="text" id="bag-search-keywords" value="${cfg.searchKeywords}" placeholder="前端开发,Vue,React">
        <label>投递城市（可多选）</label>
        <details id="bag-city-picker">
          <summary id="bag-city-summary">请选择投递城市</summary>
          <div class="bag-city-menu">
            <div id="bag-hot-cities"></div>
            <details class="bag-city-custom">
              <summary>编辑自定义城市</summary>
              <label for="bag-search-cities">城市名或名称:代码，逗号分隔</label>
              <textarea id="bag-search-cities" rows="2">${cfg.searchCities}</textarea>
            </details>
          </div>
        </details>
        <div id="bag-city-switches" style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0"></div>
        <div class="bag-tip">全国搜索结果也按此处城市严格过滤；城市未知或不匹配会跳过。保存多个城市后，点击城市按钮切换网页搜索。切换前停止任务；新城市加载后手动点击开始。城市代码可从网页选择城市后的地址栏 city 参数获取。</div>
        <label class="bag-check"><input type="checkbox" id="bag-boss-auto-follow" ${cfg.bossAutoFollowChat !== false ? "checked" : ""}> VIP 自动追聊（打招呼后自动开启）</label>
        <button id="bag-probe-autochat" style="width:100%;margin:4px 0 8px;padding:6px;border:1px solid #722ed1;border-radius:6px;background:#fff;color:#722ed1;cursor:pointer;font-size:12px;">🔍 探测追聊接口（诊断用，无需 DevTools）</button>
        `
        : "";

    const platformTip =
      platform === "boss"
        ? `配置好筛选条件后点击「采集并开始」。开启自动翻页后继续加载更多职位，达到页数或投递数量上限停止。<br>
           遇到平台限制暂停至少 30 分钟，不自动恢复。清记录会移除去重历史，可能导致重复打招呼。`
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
        <h3>${meta.label} 自动${meta.actionVerb} · v${SCRIPT_VERSION}</h3>
        <button class="bag-toggle" id="bag-collapse">收起</button>
      </div>
      <div class="bag-body">
        <div id="bag-stats">进度 0/0 | 成功 0 | 跳过 0 | 失败 0</div>
        <div class="bag-actions">
          <button id="bag-start" style="background:${meta.theme}">开始</button>
          <button id="bag-stop" disabled>停止</button>
          <button id="bag-deep-search" style="background:#722ed1;color:#fff">深度搜岗</button>
          <button id="bag-refresh">刷新职位</button>
          <button type="button" id="bag-clear" title="清除本地去重记录，可能导致重复打招呼">清除投递记录</button>
        </div>
        ${bossSearchSection}
        <div id="bag-custom-greeting">
          <label class="bag-check"><input type="checkbox" role="switch" id="bag-custom-greeting-enabled" ${cfg.customGreetingEnabled ? "checked" : ""}> 启用自定义招呼语 / 附言</label>
          <div id="bag-greeting-fields" style="display:${cfg.customGreetingEnabled ? "block" : "none"}">
            <textarea id="bag-greeting" aria-label="自定义招呼语或附言"></textarea>
            <div class="bag-tip">支持 {jobName}、{company}、{salary}。仅在网站提供对应弹窗时尝试填写或提交，不保证送达；无入口时跳过，正常打招呼与投递继续。</div>
          </div>
        </div>
        <label class="bag-check"><input type="checkbox" id="bag-auto-next" ${cfg.autoNextPage ? "checked" : ""}> 当前页处理完成后自动翻页 / 加载更多</label>
        <div class="bag-row">
          <div id="bag-salary-range">
            <label>目标月薪区间（K）</label>
            <div class="bag-row">
              <div><label for="bag-salary-range-min">最低值</label><input type="number" id="bag-salary-range-min" value="${cfg.salaryRangeMin}" min="0" step="0.5" aria-describedby="bag-salary-hint"></div>
              <div><label for="bag-salary-range-max">最高值</label><input type="number" id="bag-salary-range-max" value="${cfg.salaryRangeMax}" min="0" step="0.5" aria-describedby="bag-salary-hint"></div>
            </div>
            <div id="bag-salary-hint" class="bag-tip">与岗位薪资有重叠就通过，含边界。例如 20–30K 可匹配 17–25K、25–40K。0 表示该端不限，两项均为 0 则不限薪资；开启筛选时跳过面议或无法识别的薪资。</div>
          </div>
          <div>
            <label>本次投递上限（0 表示不限）</label>
            <input type="number" id="bag-max-count" value="${cfg.maxCount}" min="0" step="1">
            <div class="bag-tip">默认每次 50 条，仅为插件任务上限，不代表平台每日额度；遇到平台限制会停止。</div>
          </div>
          <div>
            <label>本次最多处理页数（0 表示不限）</label>
            <input type="number" id="bag-max-fetch-pages" value="${cfg.maxFetchPages}" min="0" step="1" title="含当前页；0 表示不设页数上限">
            <div class="bag-tip">默认 5 页，含当前页；滚动新增一批算一页。两项上限均填 0 并开启自动翻页，可持续处理；没有新职位、平台限制或手动停止时结束。</div>
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
    panel.querySelector("#bag-greeting").value = cfg.greeting;
    panel.querySelector("#bag-custom-greeting-enabled").addEventListener("change", (event) => {
      panel.querySelector("#bag-greeting-fields").style.display = event.target.checked ? "block" : "none";
      readPanelConfig();
    });
    arrangePanelBySteps(panel);
    getMountRoot().appendChild(panel);
    setPanelOpen(panelOpen);
    document.documentElement.setAttribute(meta.dataAttr, SCRIPT_VERSION);

    makePanelDraggable(panel);
    const renderCitySwitches = () => {
      const host = document.getElementById("bag-city-switches");
      if (!host) return;
      host.replaceChildren();
      const heading = document.createElement("div");
      heading.className = "bag-city-heading";
      heading.textContent = "已选城市快捷搜索";
      host.appendChild(heading);
      const nationwideButton = document.createElement("button");
      nationwideButton.type = "button";
      nationwideButton.textContent = "全国搜索";
      nationwideButton.title = "搜索全国职位，投递仍按自定义城市筛选";
      nationwideButton.addEventListener("click", () => {
        stopRun();
        readPanelConfig();
        const url = new URL(location.href);
        url.pathname = "/web/geek/jobs";
        url.hash = "";
        url.searchParams.set("city", "100010000");
        // 保留关键词、薪资等搜索条件，清除原城市地域与分页参数。
        for (const key of ["_security_check", "page", "district", "areaBusiness", "businessDistrict", "multiBusinessDistrict", "subway", "multiSubway"]) {
          url.searchParams.delete(key);
        }
        if (!url.searchParams.get("query")) {
          url.searchParams.set("query", splitKeywords(document.getElementById("bag-search-keywords")?.value || "")[0] || "");
        }
        location.assign(url.href);
      });
      host.appendChild(nationwideButton);
      const raw = document.getElementById("bag-search-cities")?.value || "";
      const cities = [...new Set(raw.split(/[,，、;；\s]+/).filter(Boolean))];
      const knownCities = BOSS_CITY_PRESETS;
      for (const entry of cities) {
        const parts = entry.split(/[:：]/);
        const city = knownCities[entry] || (parts.length === 2 ? parts[1] : entry);
        if (!/^\d{9}$/.test(city)) {
          const hint = document.createElement("span");
          hint.textContent = `「${entry}」请填写为 城市名称:9位城市代码`;
          host.appendChild(hint);
          continue;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = Object.keys(knownCities).find((name) => knownCities[name] === city) || (parts.length === 2 ? parts[0] : city);
        button.addEventListener("click", () => {
          stopRun();
          readPanelConfig();
          const url = new URL("/web/geek/jobs", location.origin);
          const query = new URLSearchParams(location.search).get("query") ||
            splitKeywords(document.getElementById("bag-search-keywords")?.value || "")[0] || "";
          url.searchParams.set("query", query);
          url.searchParams.set("city", city);
          location.assign(url.href);
        });
        host.appendChild(button);
      }
    };
    const renderHotCities = () => {
      const host = document.getElementById("bag-hot-cities");
      const input = document.getElementById("bag-search-cities");
      if (!host || !input) return;
      host.replaceChildren();
      const entries = input.value.split(/[,，、;；\s]+/).filter(Boolean);
      const summary = document.getElementById("bag-city-summary");
      if (summary) {
        const unique = [...new Set(entries)];
        const names = unique.map((entry) => Object.keys(BOSS_CITY_PRESETS).find((name) => BOSS_CITY_PRESETS[name] === entry) || entry.split(/[:：]/)[0]);
        summary.textContent = unique.length ? `${names.join("、")}（已选 ${unique.length}）` : "请选择投递城市";
        summary.title = names.join("、");
      }
      const hotNames = Object.keys(BOSS_CITY_PRESETS).filter((name) => name !== "全国");
      const matches = (entry, name) => entry.replace(/市$/, "") === name || entry === BOSS_CITY_PRESETS[name] || entry.split(/[:：]/)[1] === BOSS_CITY_PRESETS[name];
      const save = (values) => {
        input.value = [...new Set(values)].join(",");
        readPanelConfig();
        renderCitySwitches();
        renderHotCities();
      };
      const grid = document.createElement("div");
      grid.className = "bag-city-grid";
      for (const name of hotNames) {
        const selected = entries.some((entry) => matches(entry, name));
        const option = document.createElement("label");
        option.className = "bag-city-option";
        option.dataset.selected = String(selected);
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected;
        checkbox.dataset.city = name;
        checkbox.addEventListener("change", () => {
          save(checkbox.checked ? [...entries, name] : entries.filter((entry) => !matches(entry, name)));
          [...host.querySelectorAll("input[data-city]")].find((el) => el.dataset.city === name)?.focus();
        });
        const code = document.createElement("span");
        code.className = "bag-city-code";
        code.textContent = BOSS_CITY_PRESETS[name];
        option.append(checkbox, document.createTextNode(name), code);
        grid.appendChild(option);
      }
      host.appendChild(grid);
    };
    renderCitySwitches();
    renderHotCities();
    const picker = document.getElementById("bag-city-picker");
    const closePicker = () => {
      if (!picker) return;
      picker.open = false;
      document.getElementById("bag-city-summary")?.focus();
    };
    picker?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePicker(); }
    });
    document.addEventListener("pointerdown", (e) => {
      if (picker?.open && !picker.contains(e.target)) picker.open = false;
    });
    document.getElementById("bag-search-cities")?.addEventListener("change", () => { renderCitySwitches(); renderHotCities(); });

    document.getElementById("bag-collapse").addEventListener("click", () => {
      setPanelOpen(false);
      document.getElementById("bag-fab")?.focus();
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
    document
      .getElementById("bag-probe-autochat")
      ?.addEventListener("click", probeBossAutoChatEndpoints);


    [
      "bag-greeting",
      "bag-salary-range-min",
      "bag-salary-range-max",
      "bag-max-count",
      "bag-max-fetch-pages",
      "bag-delay-min",
      "bag-delay-max",
      "bag-blacklist",
      "bag-whitelist",
      "bag-search-keywords",
      "bag-search-cities",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => { readPanelConfig(); updateStats(); });
    });
    [
      "bag-exclude-outsourcing",
      "bag-skip-inactive",
      "bag-skip-greeted",
      "bag-auto-next",
      "bag-boss-auto-follow",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => { readPanelConfig(); updateStats(); });
    });
    ["bag-job51-guoqi", "bag-job51-yangqi", "bag-job51-waiqi"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => { readPanelConfig(); updateStats(); });
    });

    const loadTip =
      platform === "boss"
        ? "已加载：先在网页搜索职位，等待列表加载后点击「开始」"
        : "请滚动页面加载职位后点击「开始」";
    updateStats();
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

  hookNetworkForJobs();

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) lastHref = location.href;
    if (shouldShowUI() && !document.getElementById("bag-fab")) bootstrap();
  }, 1500);

  const domWatcher = new MutationObserver(() => {
    if (shouldShowUI() && !document.getElementById("bag-fab")) bootstrap();
  });
  const observeRoot = () => {
    if (document.documentElement) domWatcher.observe(document.documentElement, { childList: true, subtree: false });
  };
  if (document.documentElement) observeRoot();
  else document.addEventListener("DOMContentLoaded", observeRoot, { once: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
  waitForMount();
})();
