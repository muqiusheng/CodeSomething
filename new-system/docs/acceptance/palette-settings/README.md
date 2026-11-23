# 多配色主题验收

2026年11月21日，前端 0.29.0。本地生产构建预览使用 Headless Chromium 156。登录和注册由浏览器拦截账户配置以启用页面，刷新会话使用未登录场景。学习页和设置页使用现有本地服务。验收未提交注册、登录或学习作业。

| 验证 | 结果 |
| --- | --- |
| `npm --prefix ./new-system/frontend test` | 36 项通过，包含 4 项主题状态测试 |
| `npm --prefix ./new-system/frontend run build` | 通过，构建器提示第三方模块指令及大包体积 |
| 390×844 和 1440×900 | 注册、登录、学习、外观设置均通过，共 40 条交互断言，含注册页 320×844 检查 |
| 72 组对比度测量 | 两个账户页面 × 两个视口 × 九套配色 × 两种明暗。主按钮文字和品牌图标最低 4.70:1，悬浮配对最低 5.56:1，状态栏颜色与页面背景一致 |
| 附加检查 | 靛蓝极客浅色注册页 axe WCAG A/AA 扫描为零违规、零待判断 |

| 配色 | 浅色主按钮与图标 | 深色主按钮与图标 |
| --- | ---: | ---: |
| 云杉翡翠 | 5.29:1 | 5.80:1 |
| 靛蓝极客 | 6.29:1 | 4.70:1 |
| 暖砂琥珀 | 5.18:1 | 6.69:1 |
| 深海晴空 | 4.83:1 | 7.64:1 |
| 极昼极夜 | 17.72:1 | 18.10:1 |
| 松林苔原 | 7.13:1 | 8.55:1 |
| 暮光樱桃 | 6.29:1 | 6.81:1 |
| 黑金律动 | 5.02:1 | 8.59:1 |
| 薄荷霓虹 | 9.29:1 | 5.34:1 |

浏览器回归入口为 [check-palette-settings.mjs](../../../frontend/tests/browser/check-palette-settings.mjs)。用 `CS_BROWSER_BIN` 指向 agent-browser 可执行文件，`CS_FRONTEND_URL` 可指定本地预览地址，默认 `http://127.0.0.1:5178`。从仓库根目录运行 `node new-system/frontend/tests/browser/check-palette-settings.mjs`。脚本在本目录写出 `browser-results.json` 和四张截图。对比度由浏览器渲染颜色按 WCAG 公式计算。[WCAG 2.2 对比度指南](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

手机尺寸由 Chromium 视口模拟，实际手机浏览器的系统强制反色待实机检查。
