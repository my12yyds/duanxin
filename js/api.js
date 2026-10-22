/**
 * API 层
 * ---------------------------------------------------------------
 * 页面所有网络请求都收敛在这里，业务代码（app.js）不关心实现细节。
 *
 * - 存在 js/api-config.js 时 → 走真实接口
 * - 不存在时 → 自动进入演示模式（本地 mock，不产生任何请求）
 *
 * 统一响应约定（后端返回以下任一形态即可）：
 *   { code: 0,     message: 'ok',    data: {...} }
 *   { success: true, message: 'ok',  data: {...} }
 *   { code: 200,   msg: 'ok',        data: {...} }
 * 失败时 code 非 0 / success 为 false，message 会直接展示给用户。
 * ---------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var CFG = global.API_CONFIG || null;
  var IS_MOCK = !CFG || !CFG.verify || !CFG.verify.path;

  /* ------------------------------ 错误类型 ------------------------------ */

  function ApiError(message, options) {
    var err = new Error(message || '请求失败，请稍后重试');
    err.name = 'ApiError';
    err.code = (options && options.code) || 'UNKNOWN';
    err.status = (options && options.status) || 0;
    return err;
  }

  /* ------------------------------ 工具 ------------------------------ */

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function pickBody(map, payload) {
    if (!map) return payload;
    var out = {};
    Object.keys(map).forEach(function (backendKey) {
      var sourceKey = map[backendKey];
      if (Object.prototype.hasOwnProperty.call(payload, sourceKey)) {
        out[backendKey] = payload[sourceKey];
      }
    });
    return out;
  }

  function buildUrl(path) {
    var base = (CFG && CFG.baseUrl) || '';
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  /* ------------------------------ 请求核心 ------------------------------ */

  function request(route, payload) {
    var method = (route.method || 'POST').toUpperCase();
    var url = buildUrl(route.path);
    var timeout = (CFG && CFG.timeout) || 12000;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;

    var init = {
      method: method,
      headers: Object.assign(
        { 'Content-Type': 'application/json', Accept: 'application/json' },
        (CFG && CFG.headers) || {}
      ),
      credentials: CFG && CFG.withCredentials ? 'include' : 'same-origin',
      cache: 'no-store'
    };

    if (controller) init.signal = controller.signal;

    if (method === 'GET') {
      var qs = Object.keys(payload)
        .filter(function (k) { return payload[k] != null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]); })
        .join('&');
      if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
    } else {
      init.body = JSON.stringify(payload);
    }

    var fetchPromise = fetch(url, init).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

        if (!res.ok) {
          throw ApiError(
            (json && (json.message || json.msg)) || '服务暂时不可用（' + res.status + '）',
            { code: 'HTTP_' + res.status, status: res.status }
          );
        }
        if (!json) {
          throw ApiError('返回数据格式异常', { code: 'BAD_JSON', status: res.status });
        }

        var ok = json.code === 0 || json.code === 200 ||
                 json.success === true || json.status === 'ok';
        if (!ok) {
          throw ApiError(json.message || json.msg || '操作失败，请重试', {
            code: json.code || json.error_code || 'BIZ_ERROR',
            status: res.status
          });
        }
        return json.data !== undefined ? json.data : json;
      });
    });

    if (!controller) return fetchPromise;

    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        controller.abort();
        reject(ApiError('请求超时，请检查网络后重试', { code: 'TIMEOUT' }));
      }, timeout);
    });

    return Promise.race([fetchPromise, timeoutPromise]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') {
          throw ApiError('请求已取消', { code: 'ABORTED' });
        }
        if (e && e.name === 'ApiError') throw e;
        throw ApiError('网络异常，请检查网络连接', { code: 'NETWORK' });
      }
    );
  }

  /* ------------------------------ 演示模式 ------------------------------ */

  var MOCK_RULES = {
    // 演示用：以 0000 结尾的号码模拟「发送过于频繁」
    sendFailSuffix: '0000',
    // 演示用：正确验证码
    validCode: '123456',
    // 演示用：模拟「已过期」的验证码
    expiredCode: '000000'
  };

  var mock = {
    sendCode: function (payload) {
      return delay(620).then(function () {
        if (payload.phone.slice(-4) === MOCK_RULES.sendFailSuffix) {
          throw ApiError('该号码今日发送次数过多，请明天再试', { code: 'RATE_LIMIT' });
        }
        return { cooldown: 60, mock: true };
      });
    },

    verify: function (payload) {
      return delay(900).then(function () {
        if (payload.code === MOCK_RULES.expiredCode) {
          throw ApiError('验证码已过期，请重新获取', { code: 'CODE_EXPIRED' });
        }
        if (payload.code !== MOCK_RULES.validCode) {
          throw ApiError('验证码不正确，请检查后重试', { code: 'CODE_INVALID' });
        }
        return {
          orderId: 'MOCK' + Date.now().toString(36).toUpperCase(),
          verifiedAt: new Date().toISOString(),
          phone: payload.phone,
          mock: true
        };
      });
    }
  };

  /* ------------------------------ 对外接口 ------------------------------ */

  var api = {
    isMock: IS_MOCK,

    /**
     * 发送验证码
     * @param {{phone: string}} payload
     * @returns {Promise<{cooldown?: number}>}
     */
    sendCode: function (payload) {
      if (IS_MOCK) return mock.sendCode(payload);
      return request(CFG.sendCode, pickBody(CFG.sendCode.body, payload));
    },

    /**
     * 校验验证码
     * @param {{phone: string, code: string, requestId: string}} payload
     * @returns {Promise<object>}
     */
    verify: function (payload) {
      if (IS_MOCK) return mock.verify(payload);
      return request(CFG.verify, pickBody(CFG.verify.body, payload));
    }
  };

  global.Api = api;
})(window);
