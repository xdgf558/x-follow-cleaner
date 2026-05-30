# Development Log

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
