/**
 * API 配置模板
 * ---------------------------------------------------------------
 * 用法：把本文件复制为 js/api-config.js，填入你自己的接口地址。
 * js/api-config.js 已加入 .gitignore，不会提交到仓库。
 * 如果该文件不存在，页面会自动进入「演示模式」（本地 mock）。
 * ---------------------------------------------------------------
 */
window.API_CONFIG = {
  // 后端根地址，例如 'https://api.example.com'；留空则用同源相对路径
  baseUrl: '',

  // 发送验证码接口
  sendCode: {
    path: '/api/sms/send',
    method: 'POST',
    // 请求体字段映射：左侧是后端字段名，右侧是前端取值
    body: { phone: 'phone' }
  },

  // 校验验证码接口
  verify: {
    path: '/api/sms/verify',
    method: 'POST',
    body: { phone: 'phone', code: 'code', request_id: 'requestId' }
  },

  // 自定义请求头（如需要 appKey / 签名）
  headers: {},

  // 请求超时（毫秒）
  timeout: 12000,

  // 是否携带 Cookie（跨域时需要后端配 CORS 且不能为 *）
  withCredentials: false
};
