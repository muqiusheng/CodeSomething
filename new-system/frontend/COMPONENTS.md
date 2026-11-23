2026年11月18日0.24.0：工程连接继续复用FolderProjectWorkspace、CodeEditor、目录树和原生按钮。本机适配器仅替换读写边界；Windows选择器采用系统IFileOpenDialog与随包自有C#源码，未增加前端组件或动效库。浏览器授权保留备用。契约docs/31，验收native-project。

2026年11月18日0.23.1：本轮复体验报告优化复用现有Radix Tabs、CodeEditor、PracticeSteps和主题令牌；SQL双栏与窄屏分区使用原生按钮、CSS Grid及既有编辑器。项目预览改为统一课程示例，非运行截图。未新增组件库与动效依赖。局部样式report-refinements.css，验收visual-report。

# 组件来源与复用

`src/components/shared/LoadingState.tsx` 提供自有品牌启动态、行内圆环、三点等待提示和结构化骨架屏。样式集中在 `src/styles/loading.css`，复用 BrandMark 和主题语义变量。骨架由真实表面和低对比细线组成，220ms后淡入。品牌启动态使用细圆弧，编辑器使用等尺寸覆盖层。两种减少动效设置均使用静态占位。只读快照由 `useScopedRead` 复用，默认20秒内切页直接使用缓存，课程元数据为60秒。动态数据只在当前页面可见时每120秒校验，管理端沿用各表的轮询间隔。完成内容后按受影响的资源在后台刷新已访问的数据，手动重试也会立即读取。允许持久化的资源按账号保存到 `sessionState`，重新载入时静默校验。课内实验详情使用内存缓存，未提交的编辑仍走原草稿恢复逻辑。无新增运行依赖。

0.13.1：HeaderNavigation为自有React组件，采用daisyui breadcrumbs/menu的语义参考，使用现有React Router与Lucide，无新增组件库。原生details/summary展开栏目链接，按钮进行历史导航；sessionStorage只保存当前标签页访问分支。navigation.css沿用双主题角色；移除usePointerFeedback中的侧栏跟随测量及旧伪元素，80ms行级反馈遵循make-interfaces-feel-better高频交互规则。

2026年11月12日R3.2：SqlLearning复用本文件已有shadcn/Radix Tabs与Modal，SQL结果表、textarea、文件输入和手机章节select使用原生语义。普通CSS延续现有变量，图标沿用lucide-react；没有新增运行依赖。LeiBox查询“代码编辑器 查询结果 数据表格”和table均count=0（revision ec051883c3d34df3327ccc7d3d34972cba515288c41efff69e0d838b1c30f73e），未下载或声称采用新组件。项目图为自有HTML/CSS代码示意，不包含用户数据。

本项目使用React/TypeScript与普通CSS。新组件先复用以下实现，再按用途查询来源，不把展示页整体复制到学习应用。

## LeiBox

用户于2026年11月10日指定安装。实际执行：`npx --yes skills add https://leibox.pantoria.cn --skill leibox --agent codex --global --yes`。全局技能位于`C:/Users/lenovo/.agents/skills/leibox/SKILL.md`，后续任务可读取。只在需要组件时查询，无后台任务。

检索：`node C:/Users/lenovo/.agents/skills/leibox/scripts/leibox.mjs recommend "具体用途" --framework react --limit 3`；详情用show；下载用pull。先检查依赖、来源声明和适配性。

本次选用[Tactile Push Button](https://leibox.pantoria.cn/docs/animations/tactile-push-button)：位于`src/components/leibox/tactile-push-button`，首页续学主动作导入TactilePushButton.tsx。完整源文件下载后保留；从原Engine提取CSS到tactile.css，移除演示画布，改为原生Link以支持真实路由、键盘及新标签打开，参数在styles.css收敛为深色轻按压。原始Engine及motion-runtime用于来源追溯，未进入应用运行路径。没有新增动画库。

源码声明：少荃（Douyin：宝龙体育优品小铺）投稿，目录未提供独立许可证；保留原声明，不推断其为MIT。未来公开分发前核实适用授权。

未选：glass-tab-menu的六宫格创作菜单不符合学习页签；fluid-tooltip的纯图标侧栏不适合本项目必要标签；image-accordion没有匹配的摄影场景；otp-verification当前无对应业务。

## shadcn/ui

用户指定[中文组件站](https://www.shadcn-ui.cn/)，查看其[Tabs](https://www.shadcn-ui.cn/docs/components/tabs)与[Accordion](https://www.shadcn-ui.cn/docs/components/accordion)后，从官方registry获取源码。MIT许可证保留在`src/components/ui/LICENSE.md`。

- `src/components/ui/tabs.tsx`：课程教学/任务/报告。Radix标准页签，方向键切换、焦点管理、trigger/panel关联；value由URL控制，刷新与后退可恢复。
- `src/components/ui/accordion.tsx`：路径内容与先修。保留展开状态、ARIA与键盘行为。

两份原始registry JSON与本地适配实现一并保留；替换Tailwind工具类为现有CSS，不引入第二套设计系统。依赖已精确锁定：@radix-ui/react-tabs 1.2.1，@radix-ui/react-accordion 1.3.1。

官方来源：https://ui.shadcn.com/r/styles/new-york/tabs.json 与 https://ui.shadcn.com/r/styles/new-york/accordion.json。

## 0.4.0 全站交互组件

用户进一步授权推广趣味性至整个前端。再次实时检索LeiBox的loading、toggle、card候选：ai-generating是图像生成等待、thinking-particles是推理步骤、pixel-toggle是WebGL日夜场景，当前没有对应任务；品牌海报类缺少匹配业务；collection-layout-morph为演示品牌素材的列表/卡片/堆叠布局，本次用浏览器原生View Transition适配真实项目条目，无需引入其演示Engine。没有声称下载或接入这些未采用候选。已安装的leibox继续可供后续查询，原按压按钮继续使用。

新增shadcn组件：

- ui/modal.tsx：按官方Dialog的Radix Root、Portal、Overlay、Content、Title、Description、Close结构适配，统一普通CSS；dialog.source.json保留官方原始快照。用于项目、作品、画像和快捷导航。带焦点管理、Escape、遮罩关闭及背景交互限制。
- QuickNavigation.tsx：按官方Command构成组合cmdk.Input/List/Group/Item/Empty与Dialog，保留command.source.json。全站Ctrl/Meta K和按钮入口。
- 依赖精确锁定：@radix-ui/react-dialog 1.3.1、cmdk 1.1.1。许可证沿用ui/LICENSE.md中的MIT。

项目自有交互组件：HomePlayground、JsonExplorer、ProjectBrowser、ReviewPractice、WorkspaceExtras。使用Lucide图标和既有CSS变量；状态提示不写正式学习记录。收藏和动效偏好新增localStorage键cs-favorites、cs-motion；复习稍后仍用cs-review。

View Transition使用特性检测和减少动效判断；React flushSync在浏览器快照更新回调中提交布局，连续操作跳过上次过渡；卸载也跳过未完成过渡。没有支持该API时保留同一布局操作。

## 0.5.0 鼠标反馈与LeiBox标签

新检索并下载[stacked-metadata](https://leibox.pantoria.cn/docs/animations/stacked-metadata)，目录`src/components/leibox/stacked-metadata`。原始StackedMetadataEngine.js、motion-runtime.ts与声明文件保留；实际React入口适配为项目技术标签，metadataSpring.ts移植其解析阻尼弹簧，保留质量/刚度/阻尼及中途反向时的速度状态。去掉独立演示画布、假任务和人员/日期图标，使用本项目标签与普通CSS。新入口导入metadataSpring.ts，ProjectBrowser导入StackedMetadata。原Engine未进入生产运行路径，无远程字体或图像请求。

设计参考Gabriel：https://x.com/gabriell_lab/status/2117611847805272267/video/1；LeiBox目录声明为独立DOM/CSS实现，不声称拥有参考作者代码或转授权。保留目录声明与设计署名，不将其视为MIT组件。

项目自有usePointerFeedback参考Aceternity Card Spotlight和React Bits Magnet的交互方向，使用CSS变量/径向渐变/变换，不复制它们的品牌素材，不引入它们的库。效果覆盖卡片聚光、封面视差、跟随气泡、按钮内部磁吸与导航高亮；只对fine mouse启用，减少动效关闭跟随位移。

验证弹簧：`node --test tests/metadata-spring.test.mjs`，覆盖两端收敛、中途反向连续性与不同刷新率的一致轨迹。
0.6.0：移除Aceternity方向的跟随聚光实现。HomeLearningSections复用现有Modal；Modal新增打开时保存焦点、关闭时恢复。其余视差、标签和导航交互保留。
0.6.1：新增StageEntryDialog，复用已有Modal/Tabs，展示前置阶段到目标阶段及对应开始条件，无新依赖。
0.6.2：按用户要求删除StageEntryDialog及专用样式，路径查看项目按钮直接调用现有Modal做简单提醒。

## 0.7.0 正式前端设计

- Dashboard提取独立首页，复用LeiBox续学链接与HomePlayground；学习环节使用React Router Link。时长读取既有cs-duration键。
- LessonTutor的宽屏右栏与窄屏抽屉共享LessonTutorBody；抽屉复用现有shadcn/Radix Modal。useId避免两种呈现共用DOM标识。
- ProjectPreviewArt为项目自有HTML/CSS成果示意，图标沿用Lucide。内部装饰aria-hidden，外层预览按钮保留可访问名称。无外部图片、字体或新增组件依赖。
- design-system.css管理正式应用框架、排版、公共控件和响应式；styles.css保留课程样式和交互机制，移除449条被取代声明。
- tests/browser/check-formal-design.mjs通过既有agent-browser完成多尺寸与主流程检查；CS_BROWSER_BIN指定工具路径，无新增npm依赖。

本轮继续复用既有LeiBox和shadcn组件，未下载新组件；第三方原始声明及授权条件不变。

## 0.8.0基础项目与教学组件

复用本文件已有shadcn/Radix Tabs、Dialog和LeiBox按压按钮，不新增组件依赖。2026-11-11按章节导航/步骤、stepper两次检索LeiBox，均SOURCE_UNAVAILABLE；网页索引也不可访问，未采用新的LeiBox候选。

FoundationProject、LessonBlocks、HttpAnatomy为项目自行实现的React组件：项目分组目录、概念/示例排版、分步任务、字段/响应剖析和随堂判断。组织原则依据docs/07所列AERO、PRIMM和NN/g资料，不宣称这些组件来自LeiBox或shadcn。按钮、Tabs等底层行为沿用既有来源声明。样式放learning.css，共享颜色放design-system.css。字体、图标和减少动效体系延续原项目。

## 0.10.0网页AI辅导

LessonTutor复用既有Radix Modal与Lucide；帮助等级、上下文选择和问题使用原生select/checkbox/textarea。TutorSession为项目自行实现的React Context，桌面与抽屉共用请求、SSE连接、停止与恢复状态；TutorConnection提供本机账户连接检查。没有新增LeiBox或shadcn组件，没有新增运行依赖。样式集中在design-system.css，沿用已有变量、断点和焦点规则。


## 0.29.0 多配色外观

`ThemeControls.tsx` 复用 Radix 非模态 Dialog、Lucide 图标和具名原生单选组。样式位于 `src/styles/theme-controls.css`。快捷面板和设置卡片在局部容器上声明目标配色及明暗，复用 `theme-palettes.css` 中的真实色值。登录和注册表单沿用现有 daisyUI 5 构建配置及 `csx-` 组件。新增主题功能沿用已有依赖。

`public/theme-init.js` 持有首屏及运行期外观状态，`src/theme/theme.ts` 通过 React 外部状态订阅暴露元数据和切换方法。薄荷霓虹沿用 daisyUI 官方 Cupcake/Synthwave OKLCH 颜色，Cupcake 主内容色按对比度调整为 `oklch(28% 0.065 188.216)`。来源及 MIT 许可见 [调色板 CSS](src/styles/theme-palettes.css) 和 [许可](src/styles/theme-palettes.LICENSE)。浏览器验收见 [多配色主题](../docs/acceptance/palette-settings/README.md)。

## 0.13.0 双主题与官方daisyUI技能

用户选定Cupcake浅色、Synthwave深色。官方调色板值来源于saadeghi/daisyui master的packages/daisyui/src/themes/cupcake.css与synthwave.css，本地theme-palettes.css保留颜色值，尺寸变量--border改名--theme-border-width以避免与应用边框颜色冲突；许可证保存在src/styles/theme-palettes.LICENSE（MIT，Pouya Saadeghi）。themes.css通过语义角色适配现有组件，没有安装daisyUI/Tailwind运行依赖。

官方技能安装到项目.agents/skills/daisyui，读取主指南、颜色、安装、用法及card/button候选规范。采用基础表面、主/辅助/强调色与对应内容色的关系；继续复用Radix页签、Modal、cmdk与Lucide。主题控件ThemeControls.tsx和状态theme.ts为项目自有实现，使用原生button、fieldset和radio。

LeiBox用途检索返回pixel-toggle（WebGL内部日夜场景）与collection-layout-morph（布局变换），不适配本次轻量主题控件，未下载。原LeiBox按压链接继续复用，颜色随主题。

## 0.14.0 画像与复习

LearnerProfile、ReviewPractice与HomeReviewEntry为项目自有业务组件；复用既有Radix/shadcn Modal、Lucide、原生select/radio/textarea及现有button样式。无新增运行依赖或组件来源。learner.css沿用daisyUI主题映射，并为Portal中的表单独立设置相同语义颜色、触控高度和焦点。规则与证据来自服务端。
# R6项目工作室（2026年11月13日）

沿用React Router、普通语义表单、原生details及既有按钮与Cupcake/Synthwave变量。新增内容位于`features/projects/ProjectStudio.tsx`和`GeneratedLearning.tsx`，样式集中`styles/project-studio.css`。代码/日志区域支持键盘进入、内部滚动与可见焦点；长内容和320px单列布局使用同一套变量。

LeiBox实时检索“异步任务状态与失败重试”，返回blister-dropdown、stacked-metadata；前者的装饰性状态选择、后者的标签展开均不承担本次作业恢复流程，因此未新增下载组件。现有LeiBox组件继续保留原来源。UI/UX Pro Max采用明确恢复入口、运行反馈与防重复操作规则；daisyUI沿用已映射的主题语义，无新增运行依赖。交付检查使用[Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)与实际浏览器证据。

## 0.16.0 项目B（2026年11月13日）

课程目录、教学/任务/报告和理解题复用BootLearning、Radix页签、WorkspaceSubmission与UnderstandingVerification。原有Cupcake/Synthwave、路由和多文件配对继续使用；代码与命令区补上可聚焦的具名region。新增项目B入口、画像课程和IDE交接标识，无新增UI依赖。

业务工程的配套前端为项目自行编写的同源HTML、原生表单和fetch，由DemoController提供，动态内容使用textContent。Cupcake少量语义颜色沿用本项目既有官方调色板记录与MIT来源。它是用于展示学员后端的课程产物，源码随课程版本锁定。UI/UX Pro Max用于状态与表单规则，Impeccable只修正窄屏输入区，Web Interface Guidelines用于语义、焦点、长内容和错误反馈核对。浏览器证据见`../docs/acceptance/R7/`。


## 0.17.0 独立作品

复用现有shadcn/Radix页签、React Router、原生表单/details和Cupcake/Synthwave主题映射，不引入新的组件或运行依赖。UI/UX Pro Max用于明确保存、恢复和版本冲突；daisyUI沿用已映射主题语义与控件结构；Web Interface Guidelines用于标签、键盘、长内容、URL状态和错误反馈。按功能放features/portfolio，样式集中styles/portfolio.css；按路由拆包。来源沿用上述既有组件，无新第三方素材。
## 0.18.0 网页编程与个人中心（2026年11月16日）

代码编辑器采用微软Monaco Editor 0.57.0（MIT），从项目依赖动态加载Java/SQL/XML词法和核心查找、剪贴板功能，worker由Vite本地打包；未接Java语言服务器。原生浅/深编辑器主题调整注释与注解颜色以满足对比度，外围界面沿用已有daisyUI主题变量。雷达、进度与日历为本项目SVG/React实现，数据来自learner/profile及新增learner/stats。头像菜单自行实现ARIA菜单与方向键、焦点和锚点导航，参考用户提供的Codex截图布局，不复制账号信息。目录保存使用Chrome File System Access API，不引入云服务。

LeiBox实时检索code editor workspace及“编辑器”，仅匹配画布缩放和验证码等用途不符条目，未新增组件。使用ui-ux-pro-max、daisyui既有主题语义、tdd和web-design-guidelines；agent-browser用于真实验收。来源：[Monaco](https://github.com/microsoft/monaco-editor)、[File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)。


## 0.23.0 学习体验改进

2026年11月18日：复用现有Tabs、原生select/details/fieldset与语义主题令牌。辅导Markdown采用有限文本节点渲染，支持段落、列表、强调、行内及围栏代码，不注入HTML、不增加解析依赖。HTTP/JDBC教学与可选页面段使用LearningSupport，共享代码区可键盘聚焦。LeiBox实时recommend检索“章节导航 表单状态”返回sailing-toc和blister-dropdown，因帆船、药板意象及装饰行为与本次任务不匹配而未引入；沿用既有tactile-push-button。来源：https://leibox.pantoria.cn/docs/animations/sailing-toc 与 https://leibox.pantoria.cn/docs/animations/blister-dropdown 。

## 2026年11月19日布局与组件重构

本地工程工作区将文件目录、可横滚页签、任务区折叠控件拆成独立组件。目录和 Monaco 继续消费同一份工作区状态，结果区沿用 CheckJobReport 与 CodeCompletion。底部和左右分隔条沿用 WorkspaceDivider 的指针与键盘交互。项目技术标签的 React 入口改为语义列表，LeiBox 原始来源和历史弹簧单测保留。

## 2026年11月20日工作台交互调优

WorkspaceDivider 用指针捕获和 requestAnimationFrame 更新尺寸，从实际面板取初始值，并支持键盘、双击重置。ProjectFileDrawer 在宽屏调整独立目录列，在窄栏及手机从标签栏下方展开，由同一个项目文件图标收放。ProjectOpenFiles 使用可取消的原生滚轮事件，在标签确实可以沿该方向滚动时转换为横移。共享 CodeEditor 为各文件管理 Monaco Model 和 ViewState，切换项目或卸载时清理模型，程序同步不会将磁盘内容记成网页手工修改。
