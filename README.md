# 期数采集台

当前版本新增独立账号、工作台自定义文件夹、来源与按期资料单条/批量删除、回收站，以及可配置的科技风总览。Sites 版本保留所有者外层访问限制，首次在系统设置创建主管理员，随后使用独立账号密码。没有生产默认用户名或默认密码。

Linux 使用 Node.js 24 + SQLite 的独立生产构建，`npm run build:linux` 输出 dist-linux。系统每分钟检查采集计划，可按北京时间执行每天 19:00、每 120 分钟或每天 21:40 开奖。完整部署、HTTPS、systemd、备份导入说明见 [deploy/README.md](deploy/README.md)。Linux 尚未连接或部署到任何外部服务器。

“工作台 → 资料目录”可以创建 8 层内的文件夹、改名、移动和排序。新建/编辑采集来源时选择保存文件夹；目录与资料解析类型分别保存，移动 36 码栏目不会改写核验规则。删除目录及其下级只将栏目移至未分类，原文保留。来源删除会暂停，恢复也保持暂停。单条或跨页选择后批量删除资料，数据墓碑防止后续采集重新显示已删记录，系统设置内可恢复。删除马上从统计分母移除。

独立账号角色：管理员管理设置和用户，操作员管理资料，只读用户仅查看。服务器逐项校验角色；用户可改本人密码，管理员可重置其他用户密码、停用或调整角色；密码/角色/状态变更撤销原会话。随机会话只保存摘要；密码采用随机盐 PBKDF2-SHA256，按兼容 Workers 的 100000 次迭代，12–128 位，配合登录尝试限制和 HttpOnly/SameSite Cookie。网站上的密码与 ChatGPT 密码不同。原私有服务端点保留 Sites 访问边界；Linux 必须配置后台专用密钥。

迁移备份不包含有效会话或环境密钥。Linux 导入只接受新空数据库，不覆盖已有资料。测试包括 `tests/management.test.mjs` 和独立本地端口 5273 上的 `tests/management-workflow.mjs`；后者使用明确的本地测试账号，绝不是生产默认账号。

---


用于网页资料采集、原文留档、开奖核验与正确率统计的私人 Web 系统。正式系统从空资料库开始，没有文档导入，也没有预置作者或预测记录。

## 新建自动采集栏目

1. 点击「新增采集来源」，填写网站地址和栏目名称，例如「白小姐15码」。
2. 粘贴该栏目完整的一期样本。样本用于定位网页栏目，不直接写入采集记录。
3. 选择自动识别，预览系统从网站实际读取的对应栏目。确认年份、类型及识别完整性。
4. 保存栏目后按你设置的时间开始采集。需要立即执行时，可勾选「保存成功后立即采集一次」。新期数自动追加，已存在期数自动去重。

未识别成功也能保留配置：系统保存网址、样本和计划，将栏目设为「待识别」并暂停自动采集。修改后可再次预览和保存，无需反复填写。

在「系统设置 → 自动采集时间」选择按间隔采集，或每天固定时间（例如 16:30，北京时间）。新栏目默认跟随全站计划，也可以单独指定时间。暂停栏目不会访问来源网站或重新采集。网页位置变化时系统记录原因，并保留已填写配置。

## 资料导航和独立页面

左侧使用「资料类型 → 作者或栏目」树形菜单，可展开或收起。点击某个栏目，进入 `/materials/来源ID` 独立页面；只展示该栏目的按期原文、开奖结果、系统核验和统计。栏目网址可以直接收藏。

「采集资料」入口是按类型分组的目录页，不把所有栏目的原文堆在同一张表。总览页也以资料目录作为入口。

## 原文和核验

按来源、年份、期数唯一存档。首次原文保留文字、换行和符号；原站修改时追加版本记录，系统继续使用首次预测核验。人工修正解析会明确标记并归入历史回测。网页快照在无脚本的隔离预览中展示，保留最近 5 版；外部样式与图片无法加载时可能与原网页有视觉差异。

包含类号码、尾数、生肖、头数、单双命中为正确；半头按「头数 + 单双」组合判断，例如杀半头【0头双3头单】只排除 0 头双数和 3 头单数，不排除整个 0 头或 3 头；「杀」类在开奖属性未落入排除集合时为正确。五行、季节、段、门使用明确年度映射，缺失映射时待复核。

正确率 = 正确期数 ÷（正确期数 + 错误期数）；错误率使用同一分母。待开奖、未同步开奖、号码粘连、重复号码、缺失内容及数量不符的待复核记录不进入分母。按年份和期数匹配，不使用资料页面自写的「准」「错」作为依据。

可筛选类型、年份、期数范围、核验状态、开奖前留档或历史回测，支持 CSV 导出。

## 已接入的澳门开奖来源

用户指定 `https://mvqx1n.dlxyzw.com:1734/#dh` 网站头部「澳门彩」。系统通过其嵌入的开奖页发现实时推送地址，订阅澳门数据；只有七码完整且不同才保存特码和生肖，并保留推送原文。

这个数据流给出的是下一期的开奖时间，因此已结束期数的开奖时间保存为空，不会把下一期时间写到上一期。这类核验归入历史回测；确切开奖时间补充后可按实际留档时间区分口径。

也支持在设置中配置其他可信 JSON 开奖接口，或手动录入、批量录入已确认的结果。JSON 接口字段分别为 year、issue、number、zodiac、element、drawn_at，支持嵌套路径。期数应为 001–366，日期应含时区。不同来源的映射规则须单独确认。

## 定时任务

云端在每小时 30 分巡检到期来源。每天 16:30 的计划可对齐该巡检时刻，其他分钟会在之后一次巡检执行。页面分别展示设定时间与预计执行时间；实际启动可能受平台延迟影响，以日志为准。每个更新批次处理最多 8 个来源，并返回剩余数量，调度任务可以继续执行后续批次。开奖同步在同一轮中不会因分批重复连接。失败会显示原因并延后重试。

`POST /api/tick` 为后台更新入口。`POST /api/service` 提供配置开奖源、同步开奖、只读识别预览和读取运行状态四种维护操作。这两个入口使用所有者私有站点的平台访问校验，云任务通过站点服务访问凭证调用，凭证不写入代码或任务提示。

其他数据接口同时验证登录身份。网站保持所有者私人访问；如要开放多人或公共访问，需要先为后台入口和共享数据增加独立的权限设计。

## 支持范围

支持公开 HTML、文本正文、自定义栏目定位、常见 UTF-8 与 GBK 编码、受控跳转和超时错误记录。支持追踪同站点脚本中的静态 document.write / writeln 和 iframe 链，不执行来源脚本；最多追踪 8 个资源、3 层嵌套。识别后保存实际正文地址，后续直接采集正文。来源跳转到其他站点时会进行有限重试，仍不匹配则暂停，避免混入广告内容。HTML 定位使用 Cheerio；一个来源对应一个作者的一项资料。

已适配指定网站的动态开奖栏目。其他需要 JavaScript 渲染、登录、验证码或已失效的网站，需要实际资料页、正文接口或专门适配；系统会报告失败，不会把其他栏目误当作成功结果。

## 本地开发

需要 Node.js 22.13 或以上版本，推荐 24。安装锁定依赖后，执行 `npm run build` 生成数据库配置，然后依次应用 drizzle 目录下的迁移：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_milky_shriek.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_organic_madame_hydra.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_overrated_rictor.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_curly_salo.sql
npm run dev -- --port 5173
```

已应用的迁移不要重放。开发预览使用本地模拟登录，线上由 Sites 负责真实登录；本地身份和测试数据库不会打包进线上版本。

检查命令：`node --test tests/domain.test.mjs tests/extract.test.mjs tests/resolver.test.mjs tests/schedule.test.mjs` 和 `node node_modules/typescript/bin/tsc --noEmit`。`node tests/integration.mjs` 对正在运行的本地服务检查身份保护、来源校验、核验、去重、修改追踪和筛选，会留下标有「验收来源」的本地测试数据。`node tests/source-workflow.mjs` 使用用户报告的公开网页验证正文追踪、杀半头、配置保留、暂停恢复和每日计划继承，仅在本地数据库写入测试记录。

## 开源参考

前端使用 React，后端使用 Vinext 与 Cloudflare Workers，数据库使用 D1 / SQLite。任务管理与运行日志参考 [Crawlab](https://github.com/crawlab-team/crawlab)；去重、失败处理与节流设计参考 [Scrapy](https://github.com/scrapy/scrapy) 及 [AutoThrottle](https://docs.scrapy.org/en/latest/topics/autothrottle.html)。实际 HTML 解析使用 [Cheerio](https://github.com/cheeriojs/cheerio)。也对照了已归档的 [pyspider](https://github.com/binux/pyspider)，未将其作为依赖。


## 21:40 开奖与按期采集失败

开奖管理展示六个平码、特码和逐号生肖，按原始顺序保存，不推算缺失生肖。内置历史来源 https://2026kj.zkclhb.com:2026/am.html，可采集 2026 年全部开奖记录及站点已有的往年页面。按年份、期数去重，批量校验全部记录后写入；重复采集无重复记录，更正保留日志。历史页只提供日期时保存 draw_date，具体 drawn_at 仍为空。列表支持年份、期数筛选和分页，不再截断最近 100 期。

开奖计划固定每天北京时间 21:40，独立于资料采集计划；云端每日任务调用 POST /api/tick，由数据库计划控制是否到期，实时与历史同步分别报告错误。手动同步可随时执行。旧有每小时资料巡检的暂停状态不因新建每日开奖任务而自动改变。

每个资料来源可选择每天固定时间（如 19:00）或间隔分钟（120 即每 2 小时），并设置当期截止时间，默认 21:35。期数与日期只来自真实历史开奖记录或实时源明确提供的下一期日期，不把日历天数当期号。启用后开始跟踪，重新启用从当前时间起跟踪，暂停期间不补记失败。开奖截止后没有当期有效解析，持久化 collection_periods 失败结论；有旧期内容但无当期内容同样失败。以后补采原文仍保留失败判定。失败独立计数，不计入正确率、错误率分母。该结论可由云端任务或打开页面时完成，无需伪造空白预测原文。

新增数据库迁移：drizzle/0004_greedy_diamondback.sql。测试增加 tests/history-deadline.test.mjs，覆盖实际历史页、完整平码生肖、日期精度、截止边界、暂停、晚到资料和分母排除；tests/draw-workflow.mjs 仅对本地测试库验证真实 302 期同步、去重与晚到资料保留失败。
