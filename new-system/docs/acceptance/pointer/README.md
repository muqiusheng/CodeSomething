# 0.5.0 鼠标反馈验收

2026年11月10日。针对用户“鼠标与组件交互没感觉”的反馈，加入可感知的指针跟随与回弹，不改变课程和正式学习状态。

## 范围与实现

React+普通CSS。usePointerFeedback共享鼠标坐标调度，覆盖续学/路径/项目/复习表面、按钮内容、封面图标与预览提示、侧栏高亮。LeiBox stacked-metadata源码已下载并适配为项目技术标签，实际使用其解析弹簧；原Engine保留作为来源。没有新增npm依赖。

采用make-interfaces-feel-better处理命中范围、光学反馈、中断和回位；leibox实时检索并采用stacked-metadata；参考官网Aceternity Spotlight和React Bits Magnet。来源/署名见frontend/COMPONENTS.md及根DESIGN.md。

## 构建和行为

- npm run build最终0.5.0退出码0；TypeScript通过，Vite JS gzip117.55kB、CSS gzip17.21kB。依赖use client忽略提示仍在。
- 锁文件根与package均为0.5.0，lockfileVersion3，无新增依赖。
- node --test tests/metadata-spring.test.mjs：3/3通过，验证两端停止、反向连续及60/120Hz轨迹一致。
- 独立agent-browser会话codesomething-pointer-1110，Chromium；真实mouse move而非只查看静态CSS。
- 封面左/右移动截图显示不同聚光与提示位置；getComputedStyle图标返回不同matrix3d（含Z=28px和X/Y位移）。跨封面后只有1个preview-trigger处于pointer-active。
- 移开到空白区后pointer-active数量0，图标恢复单位矩阵。
- 标签悬停时tag-spread约1.006（阻尼回弹后趋近1），移开约0.00014后归零；固定后移开保持1；键盘聚焦为1，Escape后为0。
- 主按钮靠右上位置实际内容translate为4.08px/-1.17px；中心位置为0，符合相对中心反馈。
- 侧栏移至第4项，nav-y=150px、nav-height=44px；再移至第2项高亮滑回。
- 减少动效下鼠标移动后pointer-active=0、封面与标签transform=none；预览仍能点击打开；测试后恢复跟随系统。
- 受影响/learn、/projects、/path、/reviews在320/375/768/1024/1440px，scrollWidth均等于视口宽度。手机375截图检查技术标签没有把页面撑宽。
- 浏览器errors没有异常输出，测试会话已关闭，开发服务保留。

## 视觉与可访问性

项目页axe WCAG2A/AA：0违规、21项通过，动态渐变及标签叠放带来1类对比度待人工项（26节点）。目视检查文字位于装饰层上方，标签有深色文字及浅色底，完整名称通过按钮可访问名称提供；触屏/减少动效CSS将标签静态铺开。键盘聚焦同样能展开标签，不依赖鼠标悬停传递唯一内容。

同轮排查并修复了一个JSX括号遗漏、鼠标点击后误把焦点保持当作键盘展开，以及装饰层的子元素选择器。未进行真实手机硬件测试、低端机性能基准或浏览器动画面板10%慢速逐帧验收，不将这些项目写为通过。

## 截图

[封面左侧](projects-hover-left.png)、[封面右侧](projects-hover-right.png)、[标签展开](tags-expanded.png)、[主页聚光](home-spotlight.png)、[导航高亮](nav-hover.png)、[项目375](projects-375.png)。

## 取舍

未采用品牌线条Logo演示（与课程题材无关）、纯图标流体导航（保留现有文字导航）、全屏跟随鼠标替身（不改变系统光标）。采用局部反馈，保持已确认的信息层级及所有既有入口。
