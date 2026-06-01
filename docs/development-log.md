# Development Log

## 审查改进记录：解析兜底、批处理防重入和测试

完成时间：2026-06-01

阶段目标：根据代码审查结果降低 DOM/时间解析和批处理状态风险，并补充自动化测试。

完成内容：
1. Following 扫描在 `UserCell` 和 `cellInnerDiv` 都不可用时，会从 `main` 中的可见 profile 链接兜底提取账户。
2. 主页最近发帖时间读取在 `article[data-testid="tweet"]` 不可用时，会从可见状态帖时间链接兜底提取时间。
3. 时间解析新增周、月、年、英文 month-year、中文 `月日` 和 `年月日` 格式。
4. 批处理状态新增 `isProcessing` 和 `processingStartedAt`，避免 alarm 重入导致重复检查；超过 2 分钟视为陈旧锁可恢复。
5. `npm run check` 新增权限白名单、host 权限、CSP 检查，并串联 `npm test`。
6. 新增 `tests/dateUtils.test.mjs` 和 `tests/statusUtils.test.mjs`，覆盖时间解析和疑似取关状态逻辑。
7. README 已同步新的检查、打包和解析兜底说明。
8. 版本号更新到 `0.6.0`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/development-log.md`
5. `docs/test-checklist.md`
6. `src/background/serviceWorker.js`
7. `src/content/followingScanner.js`
8. `src/content/profileActivityParser.js`
9. `src/shared/constants.js`
10. `src/shared/dateUtils.js`
11. `tests/dateUtils.test.mjs`
12. `tests/statusUtils.test.mjs`
13. `tools/check-extension.mjs`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. X 真实 DOM 仍可能变化，兜底策略不能替代真实页面回归。
2. 公共工具函数去重属于较大结构重构，本轮先不做，避免影响内容脚本注入方式。

发现问题：
1. DOM 解析无法完全稳定，必须继续保持 unknown 保守策略和可追溯依据展示。

下一阶段注意事项：
1. 若继续抽公共工具，需要先设计内容脚本可安全加载的非 ESM shared runtime。

是否允许进入下一阶段：是

## 修复记录：互关读取导致发帖时间线抢跑

完成时间：2026-05-31

阶段目标：修复 `v0.5.0` 新增互关读取后，主页头部先加载导致插件只保存互关状态、没有继续等待最近发帖时间的问题。

完成内容：
1. 主页解析器在没有读到最近发帖时间时，会判断时间线是否真正加载完成。
2. 如果只是头部已加载、帖子时间线仍在加载，会继续返回 `profile_loading`，让后台重试。
3. 后台等待超时后仍会保留最后一次读到的互关状态，避免互关信息丢失。
4. Popup 手动读取主页也改为稳定等待逻辑，不再只注入读取一次。
5. README 已补充 `v0.5.1` 行为说明。
6. 版本号更新到 `0.5.1`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/development-log.md`
5. `src/background/serviceWorker.js`
6. `src/content/profileActivityParser.js`
7. `src/popup/popup.js`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. 真实 X 页面仍需用至少一个有最近发帖的账户回归验证。

发现问题：
1. X 主页头部和时间线的加载速度不同，不能把头部稳定等同于帖子时间线稳定。

下一阶段注意事项：
1. 以后新增主页头部字段时，不能绕过最近发帖时间线的稳定等待条件。

是否允许进入下一阶段：是

## 功能记录：互关状态和疑似取关

完成时间：2026-05-31

阶段目标：新增对方是否关注你、以及历史变化后的疑似取关提示，同时保持本地、只读、低频和不自动操作。

完成内容：
1. 主页解析器新增“跟随你 / Follows you”标记读取。
2. 账户数据新增 `mutualFollowStatus`、`followsYouLastCheckedAt`、`followsYouSourceText`、`suspectedUnfollow` 和 `suspectedUnfollowAt`。
3. 结果页新增“关注你”“未关注你”“疑似取关”筛选和统计。
4. 结果行新增互关状态和互关检查时间。
5. 手动读取主页、单个重新检查、低频自动检查都会同步更新互关状态。
6. CSV 导出新增互关字段。
7. README、stage-plan 和 test-checklist 已更新。
8. 版本号更新到 `0.5.0`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/development-log.md`
5. `docs/stage-plan.md`
6. `docs/test-checklist.md`
7. `src/content/profileActivityParser.js`
8. `src/popup/popup.js`
9. `src/results/results.html`
10. `src/results/results.css`
11. `src/results/results.js`
12. `src/shared/constants.js`
13. `src/shared/csvUtils.js`
14. `src/shared/i18n.js`
15. `src/shared/statusUtils.js`
16. `src/shared/storage.js`

已验证功能：
1. `npm run check` 已运行并通过。
2. 已用 Node 校验“第一次未关注你不标记疑似取关、从关注你变为未关注你才标记疑似取关”的状态更新逻辑。

未完成内容：
1. 真实 X 页面中不同语言下“跟随你 / Follows you”标记仍需人工回归验证。

发现问题：
1. 当前功能只能证明“当前页面是否读到对方关注你”，不能把第一次读到“未关注你”直接等同于取关。

下一阶段注意事项：
1. “疑似取关”必须继续基于历史状态变化，不要改成一次读取就下确定结论。

是否允许进入下一阶段：是

## 修复记录：低频自动检查后台队列

完成时间：2026-05-31

阶段目标：修复低频自动检查切到 X 主页后，结果页在后台标签中可能被 Chrome 降速导致批次看起来卡住的问题。

完成内容：
1. 将低频自动检查的批次状态新增为 `chrome.storage.local` 中的持久队列。
2. 将批次调度从结果页 `window.setTimeout` 循环迁移到后台 service worker。
3. 新增 `alarms` 权限，用 `chrome.alarms` 安排账户间的低频等待。
4. 结果页改为发送开始、暂停命令，并监听账户、设置、批次状态变化刷新 UI。
5. 后台检查主页时会等待目标标签页加载完成，再注入主页读取脚本。
6. README、known-issues 和 test-checklist 已更新。
7. 版本号更新到 `0.4.0`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/development-log.md`
5. `docs/known-issues.md`
6. `docs/stage-plan.md`
7. `docs/test-checklist.md`
8. `src/background/serviceWorker.js`
9. `src/results/results.js`
10. `src/shared/constants.js`
11. `src/shared/i18n.js`
12. `src/shared/storage.js`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. 真实 Chrome 中停留在 X 检查标签页时的端到端批次推进需要人工验证。

发现问题：
1. Chrome 退出、电脑休眠、扩展重载或检查标签页关闭仍可能导致检查延后或停止，因此 README 保留了这些限制说明。

下一阶段注意事项：
1. 继续保持低频、可见、可暂停，不要改成后台静默高速检查。

是否允许进入下一阶段：是

## 修复记录：结果页语言切换异常

完成时间：2026-05-31

阶段目标：修复结果页显示“Cannot set properties of null (setting 'lang')”导致账户列表无法渲染的问题。

完成内容：
1. 修复 `applyTranslations` 在 DocumentFragment 或缺少 `documentElement` 的上下文中直接设置 `lang` 的异常。
2. 保留页面级语言设置，同时让片段翻译跳过不存在的 `documentElement`。
3. 版本号更新到 `0.3.2`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `docs/development-log.md`
4. `src/shared/i18n.js`

已验证功能：
1. `npm run check` 已运行并通过。
2. 已用 Node 模拟缺少 `documentElement` 的翻译上下文，确认不会再抛出 `Cannot set properties of null`。
3. `npm run package` 已运行并生成 `dist/x-follow-cleaner-v0.3.2.zip`。
4. `unzip -l dist/x-follow-cleaner-v0.3.2.zip` 已确认 zip 包含 `LICENSE`。

未完成内容：
1. GitHub Release 资产待上传。

发现问题：
1. 该错误由 v0.3.0 引入的双语翻译工具在片段渲染时未做空值保护导致。

下一阶段注意事项：
1. 结果页账户行模板是 DocumentFragment，类似工具函数必须兼容片段渲染。

是否允许进入下一阶段：是

## 开源记录：MIT License

完成时间：2026-05-31

阶段目标：按 MIT License 要求完成项目开源基础文件，并让 README 更方便普通用户安装使用。

完成内容：
1. 新增标准 MIT `LICENSE` 文件。
2. `package.json` 标注 `license: MIT`，并补充仓库、主页和 Issues 地址。
3. 打包脚本加入 `LICENSE`，确保 Release zip 分发时携带许可证。
4. 自检脚本加入 `LICENSE` 必需文件检查。
5. README 新增快速安装、更新方法、源码打包、隐私说明、开源协议和参与开发说明。
6. 版本号更新到 `0.3.1`。

修改文件：
1. `LICENSE`
2. `manifest.json`
3. `package.json`
4. `README.md`
5. `tools/package-extension.mjs`
6. `tools/check-extension.mjs`
7. `docs/development-log.md`

已验证功能：
1. `npm run check` 已运行并通过。
2. `npm run package` 已运行并生成 `dist/x-follow-cleaner-v0.3.1.zip`。
3. `unzip -l dist/x-follow-cleaner-v0.3.1.zip` 已确认 zip 包含 `LICENSE`。

未完成内容：
1. 无。

发现问题：
1. 无。

下一阶段注意事项：
1. 以后发布任何 zip 或复制项目主要代码时，需要保留 `LICENSE` 和版权声明。

是否允许进入下一阶段：是

## v1.2 完成记录：复核、依据和双语切换

完成时间：2026-05-31

阶段目标：降低误判后的复核成本，增加结果可追溯性，并增加中文和 English 界面切换。

完成内容：
1. 结果页每个账户新增“重新检查”按钮。
2. 开启低频自动检查后，结果页支持批量“复核未活跃”和“重查无法判断”。
3. 结果页显示读取依据：原始时间文本、依据帖子链接、检查时间。
4. 未活跃判断改为二次确认：第一次超过阈值标记“待复核未活跃”，第二次仍超过阈值才标记“已确认未活跃”。
5. CSV 导出新增 `inactiveConfirmationCount`、`lastSourceText`、`lastStatusUrl` 字段。
6. 设置页新增插件界面语言：中文 / English。
7. Popup、结果页、设置页主要文案支持中文和 English 切换。
8. README、stage-plan、known-issues 和 test-checklist 已更新。
9. 版本号更新到 `0.3.0`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/stage-plan.md`
5. `docs/known-issues.md`
6. `docs/test-checklist.md`
7. `docs/development-log.md`
8. `src/shared/constants.js`
9. `src/shared/csvUtils.js`
10. `src/shared/i18n.js`
11. `src/shared/statusUtils.js`
12. `src/shared/storage.js`
13. `src/content/followingScanner.js`
14. `src/options/options.html`
15. `src/options/options.js`
16. `src/popup/popup.html`
17. `src/popup/popup.js`
18. `src/results/results.html`
19. `src/results/results.css`
20. `src/results/results.js`

已验证功能：
1. `npm run check` 已运行并通过。
2. `npm run package` 已运行并生成 `dist/x-follow-cleaner-v0.3.0.zip`。
3. `unzip -l dist/x-follow-cleaner-v0.3.0.zip` 已确认 zip 只包含插件运行文件。

未完成内容：
1. 真实 Chrome 中的中英文切换、重新检查和二次确认流程需要人工验证。

发现问题：
1. X 页面自身返回的异常文案仍可能不是插件当前界面语言。

下一阶段注意事项：
1. 继续保持复核低频，不要把复核按钮改成高速后台扫描。

是否允许进入下一阶段：是

## 修复记录：降低主页活跃度误判

完成时间：2026-05-30

阶段目标：降低“显示未活跃几十天，但主页实际近期发帖”的误判概率。

完成内容：
1. 主页解析器只读取当前主页用户名自己的 `/用户名/status/...` 时间链接。
2. 不再简单读取可见帖子里的第一个 `time`，避免读到引用帖、转发原帖或其他账号内容的时间。
3. 自动检查保存结果前会确认目标主页 URL 和目标用户名匹配。
4. 自动检查会等待目标主页内容稳定，避免连续切换主页时保存上一个账号的页面残留时间。
5. 自动检查保存结果时固定更新当前批次账号，避免解析结果里的用户名污染其他账号。
6. README、known-issues 和 test-checklist 已更新。
7. 版本号更新到 `0.2.1`。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/development-log.md`
5. `docs/known-issues.md`
6. `docs/test-checklist.md`
7. `src/content/profileActivityParser.js`
8. `src/popup/popup.js`
9. `src/results/results.js`

已验证功能：
1. `npm run check` 已运行并通过。
2. `npm run package` 已运行并生成 `dist/x-follow-cleaner-v0.2.1.zip`。
3. `unzip -l dist/x-follow-cleaner-v0.2.1.zip` 已确认 zip 只包含插件运行文件。

未完成内容：
1. 真实 X 页面仍需要人工回归验证。

发现问题：
1. 如果 X 当前可见内容里没有属于该账号自己的公开帖子时间，插件会更倾向于标记 unknown，而不是冒险保存旧时间。

下一阶段注意事项：
1. 后续若继续提高准确率，应增加结果页“重新检查已判断账号”的显式按钮，不要自动高速重查。

是否允许进入下一阶段：是

## 分发记录：GitHub Releases 打包版

完成时间：2026-05-30

阶段目标：增加可重复生成的干净 zip 打包流程，方便 GitHub Releases 和个人网站下载分发。

完成内容：
1. 新增 `npm run package`。
2. 打包文件只包含插件运行所需的 `manifest.json`、`README.md`、`assets` 和 `src`。
3. zip 根目录直接包含 `manifest.json`，便于开发者模式安装，也便于后续 Chrome Web Store 上传准备。
4. README 新增 GitHub Releases 下载和个人网站分发建议。
5. README 修正低频自动检查相关 FAQ。

修改文件：
1. `.gitignore`
2. `package.json`
3. `tools/package-extension.mjs`
4. `README.md`
5. `docs/development-log.md`

已验证功能：
1. `npm run check` 已运行并通过。
2. `npm run package` 已运行并生成 `dist/x-follow-cleaner-v0.2.0.zip`。
3. `unzip -l dist/x-follow-cleaner-v0.2.0.zip` 已确认 zip 只包含插件运行文件。

未完成内容：
1. GitHub Release 资产待上传。

发现问题：
1. 无。

下一阶段注意事项：
1. 每次版本号变更后都应重新运行 `npm run package` 并上传新的 Release 资产。

是否允许进入下一阶段：是

## 阶段 0 完成记录

完成时间：2026-05-30

阶段目标：建立项目基础结构和 Codex 记忆文件，确保后续每个阶段都能回顾前文、遵守安全边界、按验收推进。

完成内容：
1. 创建基础目录结构。
2. 创建 README 初稿、Manifest V3 初始文件和 docs 约束文件。
3. 写入安全边界和阶段推进规则。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/project-context.md`
5. `docs/stage-plan.md`
6. `docs/development-log.md`
7. `docs/test-checklist.md`
8. `docs/known-issues.md`

已验证功能：
1. 项目基础目录已创建。
2. 必需 docs 文件已存在。
3. Manifest V3 初稿已存在。

未完成内容：
1. Popup、扫描、结果、设置、导出功能尚未实现。

发现问题：
1. 图标资产需在阶段 1 补齐。

下一阶段注意事项：
1. 阶段 1 只实现插件壳子、Popup 页面、基础本地存储和清空数据。

是否允许进入下一阶段：是

## v1.1 完成记录：低频自动检查

完成时间：2026-05-30

阶段目标：在用户明确要求后，增加默认关闭、低频、可见、可暂停的自动主页活跃度检查。

完成内容：
1. 设置页新增“低频自动检查”开关，默认关闭。
2. 设置页支持每批 5、10、20 个账户，最大不超过 20。
3. 设置页支持账户间隔 15-30 秒、30-60 秒、60-120 秒。
4. 结果页新增低频自动检查面板。
5. 结果页可从未处理、非白名单、尚未判断账户中选择一批检查。
6. 运行时逐个打开可见 X 主页，不后台静默运行。
7. 用户可以暂停。
8. 每天最多检查 100 个账户。
9. 出现验证或访问限制立即停止。
10. README、stage-plan、test-checklist 和 known-issues 已更新。

修改文件：
1. `manifest.json`
2. `package.json`
3. `README.md`
4. `docs/stage-plan.md`
5. `docs/test-checklist.md`
6. `docs/known-issues.md`
7. `docs/development-log.md`
8. `src/shared/constants.js`
9. `src/shared/storage.js`
10. `src/options/options.html`
11. `src/options/options.js`
12. `src/results/results.html`
13. `src/results/results.css`
14. `src/results/results.js`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. 真实 Chrome 中的低频自动检查流程需要人工验证。

发现问题：
1. 结果页关闭后当前批次会停止，已记录为已知问题。

下一阶段注意事项：
1. 不要把低频检查升级为高速、后台静默或自动取关。

是否允许进入下一阶段：是

## 修复记录：降低验证页面误判

完成时间：2026-05-30

阶段目标：修复正常浏览 X Following 页面时误提示“页面疑似出现验证要求”的问题。

完成内容：
1. 移除过宽的 `verify + account` 文案判断。
2. 改为匹配更明确的验证挑战文案，例如 CAPTCHA、confirm your identity、complete challenge、unusual activity。
3. 如果页面已经有可见 Following 用户卡片或主页内容，不再仅凭页面文案触发验证拦截。
4. 版本号更新到 `0.1.2`。

修改文件：
1. `src/content/followingScanner.js`
2. `src/content/profileActivityParser.js`
3. `manifest.json`
4. `package.json`
5. `docs/development-log.md`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. 真实 X 页面需要用户重新加载插件后再验证。

发现问题：
1. X 页面文案会变化，验证页面检测仍需保持保守但避免普通页面误判。

下一阶段注意事项：
1. 用户需要在 `chrome://extensions` 里 Reload 插件后重试扫描。

是否允许进入下一阶段：是

## 阶段 1 完成记录

完成时间：2026-05-30

阶段目标：完成一个能在 Chrome 开发者模式安装、能打开 Popup、能显示基础状态的插件壳子。

完成内容：
1. 实现 Popup 页面、样式和基础交互。
2. 实现基础 storage。
3. 实现 background service worker 安装初始化。
4. 补齐 PNG 图标。
5. 创建结果页和设置页占位，避免断链。

修改文件：
1. `src/background/serviceWorker.js`
2. `src/popup/popup.html`
3. `src/popup/popup.css`
4. `src/popup/popup.js`
5. `src/shared/constants.js`
6. `src/shared/storage.js`
7. `src/results/results.html`
8. `src/results/results.css`
9. `src/results/results.js`
10. `src/options/options.html`
11. `src/options/options.css`
12. `src/options/options.js`
13. `assets/icon16.png`
14. `assets/icon48.png`
15. `assets/icon128.png`
16. docs 文件

已验证功能：
1. `manifest.json` 可以解析。
2. Popup、结果页占位、设置页占位文件已存在。
3. PNG 图标格式和尺寸正确。

未完成内容：
1. Following 页面扫描尚未实现。

发现问题：
1. Load unpacked 和 Popup Console 仍需真实 Chrome 验证。

下一阶段注意事项：
1. 阶段 2 只实现当前 Following 页面已展示账户的只读扫描和本地保存。

是否允许进入下一阶段：是

## 阶段 2 完成记录

完成时间：2026-05-30

阶段目标：用户打开 X Following 页面并手动滚动后，插件能读取当前页面已经展示出来的关注账户。

完成内容：
1. 实现 `followingScanner.js`。
2. 只读取当前 DOM 中已经出现的账户卡片。
3. 提取 username、displayName、profileUrl、avatarUrl、bio。
4. 以小写 username 去重并保存到本地。
5. Popup 扫描按钮接入当前标签页脚本注入。

修改文件：
1. `src/content/followingScanner.js`
2. `src/popup/popup.js`
3. docs 文件

已验证功能：
1. `followingScanner.js` 语法检查通过。
2. `popup.js` 语法检查通过。
3. Manifest 禁止权限检查通过。
4. 未加入自动滚动、自动打开主页或批量点击。

未完成内容：
1. 真实 X Following 页面扫描效果需要人工验证。

发现问题：
1. X DOM 结构可能变化，选择器需真实页面验证。

下一阶段注意事项：
1. 阶段 3 只实现结果页基础版。

是否允许进入下一阶段：是

## 阶段 3 完成记录

完成时间：2026-05-30

阶段目标：提供一个清晰的结果页，让用户查看已采集账户，并可以打开主页手动检查。

完成内容：
1. 实现结果页列表。
2. 支持搜索 username。
3. 支持状态筛选。
4. 支持打开主页。
5. 支持标记已处理和加入白名单。
6. 新增状态工具模块。

修改文件：
1. `src/results/results.html`
2. `src/results/results.css`
3. `src/results/results.js`
4. `src/shared/statusUtils.js`
5. docs 文件

已验证功能：
1. `results.js` 语法检查通过。
2. `statusUtils.js` 语法检查通过。
3. 未加入主页解析、导出或高风险自动化。

未完成内容：
1. 结果页真实 Chrome 交互仍需人工验证。

发现问题：
1. 头像加载和页面样式需在真实 Chrome 中验证。

下一阶段注意事项：
1. 阶段 4 只实现用户手动打开主页后的活跃度读取。

是否允许进入下一阶段：是

## 阶段 4 完成记录

完成时间：2026-05-30

阶段目标：用户手动打开某个账户主页后，插件可以读取当前主页中可见的最近公开发帖时间，并更新该账户状态。

完成内容：
1. 实现 `profileActivityParser.js`。
2. 实现 `dateUtils.js`。
3. Popup 读取主页按钮接入当前标签页。
4. 支持解析 `5m`、`2h`、`3d`、`May 20`、`May 20, 2025`。
5. 根据设置阈值判断 active 或 inactive。
6. 无法判断标记 unknown，页面错误标记 error。

修改文件：
1. `src/content/profileActivityParser.js`
2. `src/shared/dateUtils.js`
3. `src/shared/constants.js`
4. `src/popup/popup.js`
5. docs 文件

已验证功能：
1. 相关 JS 语法检查通过。
2. 文档要求的时间解析样例通过 Node 验证。
3. 未加入自动打开主页或批量检查。

未完成内容：
1. 真实 X 账户主页读取需要人工验证。

发现问题：
1. 非英文置顶帖文案可能影响最近帖子判断。

下一阶段注意事项：
1. 阶段 5 只实现设置页和设置保存。

是否允许进入下一阶段：是

## 阶段 5 完成记录

完成时间：2026-05-30

阶段目标：让用户可以调整未活跃判断天数和显示规则，但不开放高风险自动化功能。

完成内容：
1. 实现设置页。
2. 支持未活跃判断天数、隐藏白名单、显示 unknown、默认排序、语言提示。
3. 设置保存到 `chrome.storage.local`。
4. 结果页和 Popup 按设置阈值重新计算展示状态。
5. 强制保持实验批量检查关闭。

修改文件：
1. `src/options/options.html`
2. `src/options/options.css`
3. `src/options/options.js`
4. `src/shared/statusUtils.js`
5. `src/results/results.js`
6. `src/popup/popup.js`
7. docs 文件

已验证功能：
1. 相关 JS 语法检查通过。
2. 30 天和 60 天阈值重算样例通过 Node 验证。

未完成内容：
1. 设置页真实 Chrome 保存和刷新保留需要人工验证。

发现问题：
1. 未发现新增权限或高风险自动化入口。

下一阶段注意事项：
1. 阶段 6 只实现 CSV 和 JSON 本地导出。

是否允许进入下一阶段：是

## 阶段 6 完成记录

完成时间：2026-05-30

阶段目标：支持用户导出本地扫描结果，方便备份和在表格中查看。

完成内容：
1. 实现 CSV 导出。
2. 实现 JSON 导出。
3. 结果页新增导出入口。
4. 导出内容不包含 Cookie、Token、密码、私信或浏览器会话信息。
5. 未新增 `downloads` 权限。

修改文件：
1. `src/shared/csvUtils.js`
2. `src/results/results.html`
3. `src/results/results.css`
4. `src/results/results.js`
5. docs 文件

已验证功能：
1. `csvUtils.js` 和 `results.js` 语法检查通过。
2. CSV 字段头和转义样例通过 Node 验证。
3. Manifest 检查确认没有 `downloads` 权限。

未完成内容：
1. 真实 Chrome 下载 CSV/JSON 文件需要人工验证。

发现问题：
1. 未发现敏感字段导出。

下一阶段注意事项：
1. 阶段 7 强化错误处理与稳定性。

是否允许进入下一阶段：是

## 阶段 7 完成记录

完成时间：2026-05-30

阶段目标：增强异常提示，避免页面结构变化或访问限制导致插件静默失败。

完成内容：
1. 新增 `domUtils.js` 统一 URL 判断。
2. 增强 Following 页面和主页读取异常提示。
3. 覆盖未登录、非 X、非 Following、无账户、无公开帖子、受保护、暂停或不存在、验证、访问限制、页面异常和 DOM 变化提示。
4. 新增 `tools/check-extension.mjs` 自检脚本。
5. 更新 known issues。

修改文件：
1. `src/shared/domUtils.js`
2. `src/popup/popup.js`
3. `src/content/followingScanner.js`
4. `src/content/profileActivityParser.js`
5. `tools/check-extension.mjs`
6. docs 文件

已验证功能：
1. `npm run check` 通过。
2. 必需文件、禁止权限和 `src` JS 语法检查通过。
3. 未加入无限重试、自动滚动或批量访问。

未完成内容：
1. 真实 X 页面异常提示仍需人工环境验证。

发现问题：
1. X 页面 DOM 和语言文案变化仍可能导致解析失败。

下一阶段注意事项：
1. 阶段 8 完善 README、测试清单和最终验收。

是否允许进入下一阶段：是

## 阶段 8 完成记录

完成时间：2026-05-30

阶段目标：让零基础用户可以按照 README 完成安装、使用、导出和安全操作。

完成内容：
1. 完善 README。
2. 整理 development log 阶段顺序。
3. 更新测试清单和最终验收记录。
4. 保留人工验证事项说明。
5. 执行最终自检。

修改文件：
1. `README.md`
2. `docs/stage-plan.md`
3. `docs/development-log.md`
4. `docs/test-checklist.md`

已验证功能：
1. `npm run check` 已运行并通过。
2. README 包含用途、安全边界、本地安装方法、使用步骤、常见问题、导出、清空数据、账号风险提醒和截图占位说明。

未完成内容：
1. 真实 Chrome Load unpacked、X 页面扫描、主页读取、设置保存、导出下载仍需人工验证。

发现问题：
1. 无新增代码风险；剩余风险集中在真实 X DOM 与 Chrome 手动验收。

下一阶段注意事项：
1. MVP 已完成；v1.1 低频批量检查不得进入，除非用户后续明确要求。

是否允许进入下一阶段：否，MVP 阶段已完成

## 功能更新记录：保守验证节奏

完成时间：2026-05-30

阶段目标：将人工建议的保守验证节奏变成设置项，降低用户连续高频点击扫描按钮的概率。

完成内容：
1. 设置页新增“保守验证节奏”开关。
2. 设置页新增扫描按钮等待时间：30 秒、45 秒、60 秒。
3. 默认开启保守验证节奏，默认扫描冷却为 30 秒。
4. Popup 在冷却期间禁用“扫描当前页面”，并显示剩余秒数。
5. README 和测试清单补充验证说明。

修改文件：
1. `manifest.json`
2. `package.json`
3. `src/shared/constants.js`
4. `src/options/options.html`
5. `src/options/options.js`
6. `src/popup/popup.js`
7. `README.md`
8. `docs/test-checklist.md`
9. `docs/development-log.md`

已验证功能：
1. `npm run check` 已运行并通过。

未完成内容：
1. 真实 Chrome Popup 倒计时和设置保存仍需人工验证。

发现问题：
1. 无新增权限。

下一阶段注意事项：
1. 若后续需要限制“读取当前主页最近发帖时间”，可复用同一保守节奏机制，但不要自动批量打开主页。

是否允许进入下一阶段：是
