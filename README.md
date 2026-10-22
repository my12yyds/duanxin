# 手机号验证 H5 表单页

一个干净、可直接使用的前端页面：手机号输入 + 验证码校验 + 结果反馈。
纯原生 HTML/CSS/JS，零依赖、零构建，双击 `index.html` 就能跑。

## 目录结构

```
h5-form/
├── index.html                 页面结构
├── css/style.css              样式（移动优先，响应式）
├── js/
│   ├── api-config.example.js  接口配置模板（提交到仓库）
│   ├── api-config.js          真实配置（已 gitignore，不提交）
│   ├── api.js                 请求封装 + 演示模式 mock
│   └── app.js                 表单交互逻辑
├── .gitignore
└── README.md
```

## 快速开始

直接双击 `index.html`，或用任意静态服务器打开：

```bash
python -m http.server 8080
# 打开 http://localhost:8080
```

未配置接口时自动进入**演示模式**，不会发出任何真实请求：

| 输入 | 结果 |
| --- | --- |
| 验证码 `123456` | 验证成功 |
| 验证码 `000000` | 提示「验证码已过期」 |
| 其他 6 位数字 | 提示「验证码不正确」 |
| 手机号以 `0000` 结尾 | 模拟「发送次数过多」 |

## 接入真实接口

`js/api-config.js` 已经在本地生成好了（内容是一段注释模板，已被 gitignore），直接编辑它即可：

```js
window.API_CONFIG = {
  baseUrl: 'https://api.your-domain.com',
  sendCode: { path: '/api/sms/send',   method: 'POST', body: { phone: 'phone' } },
  verify:   { path: '/api/sms/verify', method: 'POST', body: { phone: 'phone', code: 'code', request_id: 'requestId' } },
  headers: { 'X-App-Key': 'xxx' },
  timeout: 12000,
  withCredentials: false
};
```

如果该文件丢失，从模板重新复制一份：

```bash
cp js/api-config.example.js js/api-config.js
```

`body` 是字段映射：左边是后端字段名，右边是前端字段名。`requestId` 是前端每次提交生成的唯一 ID，后端可用它做幂等去重，防止重复校验。

## 后端响应约定

成功（三种形态任选其一）：

```json
{ "code": 0, "message": "ok", "data": { "orderId": "...", "verifiedAt": "2026-10-22T12:00:00Z" } }
```

失败（`message` 会直接展示给用户）：

```json
{ "code": 4001, "message": "验证码不正确" }
```

HTTP 非 2xx 时也会读取响应体里的 `message` / `msg` 作为提示文案。

## 页面功能

| 区域 | 功能 |
| --- | --- |
| 顶部快捷入口 | 公告弹窗（首次访问自动弹出，之后可手动打开）、客服弹窗（联系方式 + 一键复制）、留言弹窗 |
| 功能操作 | 滚动通知条、三步进度指示、手机号 + 验证码表单、提交 / 清空重填 |
| 问题解答 | 6 条常见问题手风琴（原生 `<details>`，无需 JS） |
| 关注本站 | 收藏提示、复制链接、系统分享（不支持时降级为复制） |
| 更多功能 | 最近验证记录（本地，最多 5 条，脱敏号码）、一键清除、关于信息 |
| 结果反馈 | 成功独立结果页 / 失败 toast + 内联报错 |

交互细节：

- 弹窗支持点击遮罩关闭、`Esc` 关闭、关闭后焦点回到触发按钮，打开时锁定页面滚动
- 留言无后端时保存在 `localStorage`（最多 20 条），接入接口后可替换为真实提交
- 验证记录只存脱敏号码（`138 **** 8000`），不保存完整手机号

## 已实现的细节

**校验**
- 手机号实时过滤非数字，最多 11 位，`1[3-9]\d{9}` 规则校验
- 验证码只允许 6 位数字，粘贴自动清洗（复制「123 456」也能识别）
- 失焦校验、报错后输入合法即时消除错误、错误字段抖动 + 红框提示
- 提交时定位并聚焦第一个错误项

**防重复提交**
- 状态锁 `submitting` + 按钮禁用 + 输入框禁用，三重拦截
- 提交期间按钮显示 loading 文案与转圈
- 获取验证码按钮 60 秒倒计时，倒计时状态写入 `localStorage`，刷新页面也不会绕过
- 切换手机号后自动解除上一个号码的倒计时

**结果反馈**
- 成功：独立结果页（对勾动画、脱敏手机号、验证时间、流水号）+ 返回修改
- 失败：验证码类错误定位到输入框并全选，其余用顶部 toast 提示

**体验与兼容**
- 移动优先，`max-width: 420/440px` 居中卡片，适配刘海屏安全区
- 输入框 16px 字号，避免 iOS 聚焦自动放大
- `inputmode="numeric"`、`autocomplete="one-time-code"` 支持系统短信验证码自动填充
- `prefers-reduced-motion` 下关闭动效
- 键盘可访问：`:focus-visible` 焦点环、`role="alert"`、`aria-live`

## 说明

页面只做「本人手机号验证」这一件事，不包含也不应接入任何第三方群发/轰炸类接口。
