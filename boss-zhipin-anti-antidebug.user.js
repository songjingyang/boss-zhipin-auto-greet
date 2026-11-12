// ==UserScript==
// @name         Boss直聘 反反调试（仅供自查网络请求用）
// @namespace    https://github.com/songjingyang/boss-zhipin-auto-greet
// @version      1.1.0
// @description  阻止 Boss 直聘检测到 DevTools 后强制关闭标签页，仅用于自行排查网络请求，不用于绕过其他限制
// @author       宋璟阳
// @match        https://www.zhipin.com/*
// @icon         https://www.zhipin.com/favicon.ico
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/songjingyang/boss-zhipin-auto-greet/main/boss-zhipin-anti-antidebug.user.js
// @downloadURL  https://raw.githubusercontent.com/songjingyang/boss-zhipin-auto-greet/main/boss-zhipin-anti-antidebug.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---------- 第一层：劫持 window.close ----------
  // 用户反馈现象是「标签页真的被关掉」，Chrome 允许脚本关闭「只有一条历史记录」的标签页，
  // 这正是反调试脚本最常用的收尾手段，优先级最高、最直接。
  try {
    Object.defineProperty(window, "close", {
      value: function () {},
      writable: false,
      configurable: false,
    });
  } catch {
    try {
      window.close = function () {};
    } catch {
      /* 该属性彻底不可覆盖时忽略，后续几层防护仍生效 */
    }
  }

  // ---------- 第二层：console 方法置空 ----------
  // 常见「打印带自定义 getter/toString 的对象让 DevTools 格式化时触发」检测手法，
  // 不依赖断点暂停也不依赖窗口尺寸，只要 devtools 面板对 console 输出做渲染就会触发。
  // 直接让 console.* 变成不读取参数的空函数，彻底不给它们被访问的机会。
  const consoleMethods = [
    "log",
    "table",
    "dir",
    "debug",
    "info",
    "warn",
    "error",
    "trace",
    "group",
    "groupCollapsed",
    "groupEnd",
    "assert",
  ];
  const noop = function () {};
  consoleMethods.forEach((m) => {
    try {
      Object.defineProperty(console, m, { value: noop, configurable: true });
    } catch {
      /* 只读环境下忽略 */
    }
  });

  // ---------- 第三层：清空动态生成代码里的 debugger 语句 ----------
  // 配合 DevTools 里手动「停用断点」，双重防护基于 debugger 关键字轮询的检测。
  const OrigFunction = window.Function;
  const stripDebugger = (src) =>
    typeof src === "string" ? src.replace(/\bdebugger\b/g, "") : src;
  try {
    window.Function = function (...args) {
      const body = args.length ? stripDebugger(args[args.length - 1]) : args;
      const patched = args.slice(0, -1).concat(body);
      return new OrigFunction(...patched);
    };
    window.Function.prototype = OrigFunction.prototype;
  } catch {
    /* 部分严格模式下可能失败，忽略即可，其他两层依然生效 */
  }

  const origEval = window.eval;
  try {
    window.eval = function (src) {
      return origEval(stripDebugger(src));
    };
  } catch {
    /* ignore */
  }

  // ---------- 第四层：抹平 devtools 尺寸差检测 ----------
  // 双保险：即使忘了手动弹出独立窗口，也让 outerWidth/outerHeight 始终跟随 innerWidth/innerHeight。
  ["outerWidth", "outerHeight"].forEach((prop) => {
    try {
      Object.defineProperty(window, prop, {
        get() {
          return prop === "outerWidth" ? window.innerWidth : window.innerHeight;
        },
        configurable: true,
      });
    } catch {
      /* 部分浏览器该属性不可配置，忽略 */
    }
  });
})();
