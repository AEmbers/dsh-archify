# dsh-archify

简体中文 | [English](#english)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek%20Harness-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![上游](https://img.shields.io/badge/移植自-archify-orange.svg)](https://github.com/tt-a1i/archify)

> **一句话：给 DeepSeek Harness 一个会画图的 agent 技能 —— 用 JSON 规格生成可验证的架构图、流程图、时序图、数据流图、生命周期图、ER 图、类图、树图、时间线与请求瀑布图，输出独立 HTML。**

移植自 [`tt-a1i/archify`](https://github.com/tt-a1i/archify)（MIT，`v3.1.0` / 技能版本 3.1.0；官方 npm 包 `@tt-a1i/archify-dsh@1.0.0` 里打包的是技能 3.0.1，本 fork 比它新一版）。
技能本体（`archify/` 与 `examples/`）逐字保留，只适配了 dsh 的打包与命名。

## ✨ 功能

- 🗺️ **十种图型** —— architecture / workflow / sequence / dataflow / lifecycle，加上 3.1 新增的 erd / class / tree / timeline / waterfall，一个 JSON 规格对应一种
- ✅ **可验证** —— 提交前跑 `validate`，确定性校验给出 9 项验收（showcase）或基础验收（standard）
- 🌗 **深浅主题 + 视觉预设** —— classic 默认，signal-flow / blueprint / editorial 按需切换
- 📤 **多格式导出** —— 独立 HTML、PNG、SVG、WebM，以及 1200×630 分享卡片
- 🔀 **Mermaid 输入** —— 粘贴 flowchart / sequenceDiagram / stateDiagram，转为 Archify JSON 再美化
- 🔍 **架构对比** —— `compare` 两份快照，输出 Before / Delta / After 三态 HTML
- 🌏 **界面文案多语言** —— `locales/` 提供技能输出的界面语言（3.1 新增）

## 📸 效果

给一个场景描述，agent 产出 JSON 规格并交付独立 HTML：

```
> 用 archify 画这个仓库的运行时架构，8–12 个核心组件，一条主路径，标出外部依赖与信任边界。

  write  runtime.architecture.json      ← agent 先写规格
  bash   node bin/archify.mjs validate architecture runtime.architecture.json --quality showcase
  bash   node bin/archify.mjs deliver architecture runtime.architecture.json runtime.html --quality showcase
  → 交付 runtime.html（深浅主题、可搜索、可分享）
```

## 📦 安装

```bash
dsh plugin --profile <你的 profile> add github:AEmbers/dsh-archify
```

本 fork 已把 `skills/` 产物**提交进仓库**（上游是安装时用 `prepare` 现生成），所以安装过程
**不含任何构建脚本**：pnpm 11 默认禁止 git 依赖执行构建脚本，这里不会触发，也**不需要**在
profile 的 `pnpm-workspace.yaml` 里加 `allowBuilds`。

从本地目录安装：

```bash
git clone https://github.com/AEmbers/dsh-archify.git
dsh plugin --profile <你的 profile> add ../dsh-archify
```

改了 `archify/` 之后用 `npm run stage` 重新生成 `skills/`（测试会校验两者逐字节一致）。

环境要求：Node.js `^22.19.0 || >=24.0.0`，dsh `>=0.2.1-alpha.5`（已在 0.2.1-alpha.5 实测）。

## 🚀 用法

让 agent 按名字加载技能：

```text
Use the archify skill to map this repository's runtime architecture.
Show 8–12 core components, one primary path, external dependencies, and trust boundaries.
Put supporting detail in cards instead of adding more edges.
After delivery, return the exact workspace paths of the specification JSON and the HTML artifact.
```

卸载：

```bash
dsh plugin --profile <你的 profile> remove dsh-archify
```

**Produced Files 限制：** shell 命令生成的文件不会自动出现在 Web 端的 Produced Files 栏，
请让 agent 返回规格 JSON 与 HTML 工件的**精确工作区路径**，再从工作区打开（上游官方 DSH 包同样如此）。

**安全姿态：** 无遥测、无网络客户端、无凭据处理、无后台服务；**没有任何生命周期脚本**
（`install` / `postinstall` / `preinstall` / `prepare` 全无），`skills/` 产物直接提交在仓库里。

<details>
<summary>移植说明（对上游 <code>tt-a1i/archify</code> @ <code>v3.1.0</code>）</summary>

逐字保留，`diff` 可验证：`archify/`（SKILL.md、renderers、schemas、bin、examples、recipes、
references、assets、delta、scripts、locales、brand-marks、migrations）与根目录 `examples/`
全部为上游原文件。

**这一点你可以自己验，不必信我们** —— [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
钉住了上游 release tag、commit 与全部 182 个逐字文件的 SHA-256，附可直接复制的比对命令；
`test/zero-regression.test.mjs` 每次 `npm test` 都会重算比对，并要求清单恰好覆盖
`git ls-files archify examples` 全树。

适配处（上游官方 DSH 包 `@tt-a1i/archify-dsh@1.0.0` → `dsh-archify`）：
包名与解析路径改为 `dsh-archify`；`skills/` 由 `npm run stage` 生成并提交（上游发预构建
tarball，git 安装需要自行暂存）；上游仓库根目录的网站/发布文件（`docs/`、`website/`、
`README_EN.md`、`benchmarks/`、`.github/` 等）不属于技能本体，未移植。

**测试策略：** 上游在 3.1 线把测试从 `archify/test/` 移到仓库根 `test/`，且发布包
（`archify.zip`）不再带测试；那些测试按上游仓库布局解析路径，搬进来必须改写，改写就破坏了
逐字保留。本 fork 因此不带上游测试，改为从外部验证：

- `test/examples-parity.test.mjs` —— 用本包 renderer 重渲染全部 25 个示例规格，并把其中
  15 个有上游规范渲染的示例**逐字节**比对（渲染确定性 ⇒ renderer/schema/template/内嵌
  校验器任一处漂移都会暴露）。
- `test/zero-regression.test.mjs` —— 重算 SHA-256 清单并校验覆盖度。

**已知限制：** 技能文案是英文 —— 那是上游原文，逐字保留未做翻译（3.1 新增的 `locales/`
只影响生成图里的界面文案语言）。
</details>

## 🛠 开发

```bash
npm install          # 无生命周期脚本，装完即可用
npm run stage        # 由 archify/ 重新生成并提交 skills/archify
npm test             # adapter 契约测试 + 示例渲染一致性 + 哈希清单复算
node scripts/pack.mjs --out /tmp/dsh-archify.tgz   # 本地打 tarball
```

`npm test` 覆盖：包/清单契约（版本 0.2.0、零依赖、无生命周期脚本）、`cordis.patch.yml`
的插入块、tarball 内容与 clean-staging 一致、`skills/` 与 `archify/` 逐字节一致、
THIRD_PARTY_NOTICES 哈希清单、十种图型的示例渲染与上游规范渲染逐字节一致。
`npm run test:skill` 在上游测试缺席时直接跳过并打印原因（见上）。

## 📄 License

MIT。上游 [`tt-a1i/archify`](https://github.com/tt-a1i/archify)
`Copyright (c) 2026 tt-a1i (Archify)`，`Copyright (c) 2025 Cocoon AI`，
本移植 `Copyright (c) 2026 GongYuanCaiJi (dsh port)`。见 [LICENSE](./LICENSE)。

感谢 [tt-a1i](https://github.com/tt-a1i) 的原作者 —— 如果这个插件对你有用，
**也请去给[上游仓库](https://github.com/tt-a1i/archify)点个 star**。

---

## English

[简体中文](#dsh-archify)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-DeepSeek%20Harness-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Upstream](https://img.shields.io/badge/port%20of-archify-orange.svg)](https://github.com/tt-a1i/archify)

> **One line: a diagramming agent skill for DeepSeek Harness — turn a small typed JSON spec into a validated architecture, workflow, sequence, data-flow, lifecycle, ER, class, tree, timeline, or request-waterfall diagram as a self-contained HTML artifact.**

A port of [`tt-a1i/archify`](https://github.com/tt-a1i/archify) (MIT, `v3.1.0` / skill 3.1.0; the official npm package `@tt-a1i/archify-dsh@1.0.0` still ships skill 3.0.1, so this fork is one release ahead).
The skill payload (`archify/` and `examples/`) is byte-identical to upstream; only the dsh packaging and naming are adapted.

## ✨ Features

- 🗺️ **Ten diagram types** — architecture / workflow / sequence / dataflow / lifecycle, plus the 3.1 additions erd / class / tree / timeline / waterfall, from one JSON spec
- ✅ **Verifiable** — deterministic `validate` with 9-check showcase or basic acceptance receipts
- 🌗 **Themes & presets** — dark/light plus signal-flow / blueprint / editorial visual presets
- 📤 **Exports** — standalone HTML, PNG, SVG, WebM, and 1200×630 share cards
- 🔀 **Mermaid input** — paste flowchart / sequenceDiagram / stateDiagram, re-author as Archify JSON
- 🔍 **Architecture compare** — `compare` two snapshots into Before / Delta / After HTML
- 🌏 **Localized viewer UI** — `locales/` (new in 3.1)

## 📸 Effect

Describe a system, and the agent authors the JSON spec and delivers the HTML:

```
> Use the archify skill to map this repository's runtime architecture.

  write  runtime.architecture.json      ← agent authors the spec first
  bash   node bin/archify.mjs validate architecture runtime.architecture.json --quality showcase
  bash   node bin/archify.mjs deliver architecture runtime.architecture.json runtime.html --quality showcase
  → delivers runtime.html (dark/light, searchable, shareable)
```

## 📦 Install

```bash
dsh plugin --profile <your-profile> add github:AEmbers/dsh-archify
```

This fork **commits the `skills/` payload** (upstream generates it at install time with `prepare`),
so installing runs **no build script at all** — pnpm 11 refuses those for git dependencies, and this
fork never triggers that path, so no `allowBuilds` entry in the profile's `pnpm-workspace.yaml` is
needed.

From a local directory:

```bash
git clone https://github.com/AEmbers/dsh-archify.git
dsh plugin --profile <your-profile> add ../dsh-archify
```

After editing `archify/`, run `npm run stage` to regenerate `skills/` (the test suite diffs the two
byte-for-byte).

Requires Node.js `^22.19.0 || >=24.0.0` and dsh `>=0.2.1-alpha.5` (verified on 0.2.1-alpha.5).

## 🚀 Usage

Ask the agent to load the skill by name:

```text
Use the archify skill to map this repository's runtime architecture.
Show 8–12 core components, one primary path, external dependencies, and trust boundaries.
Put supporting detail in cards instead of adding more edges.
After delivery, return the exact workspace paths of the specification JSON and the HTML artifact.
```

Uninstall:

```bash
dsh plugin --profile <your-profile> remove dsh-archify
```

**Produced Files limitation:** files created by shell commands do not automatically appear in
the Web Produced Files strip — ask the agent to return the **exact workspace paths** of the
specification JSON and the HTML artifact, then open them from the workspace (same as the
official upstream DSH package).

**Security posture:** no telemetry, network client, credentials handling, or background
service; **no lifecycle scripts at all** (`install` / `postinstall` / `preinstall` / `prepare`);
the `skills/` payload is committed to the repository.

<details>
<summary>Port notes (vs upstream <code>tt-a1i/archify</code> @ <code>v3.1.0</code>)</summary>

Byte-identical, diff-verifiable: `archify/` (SKILL.md, renderers, schemas, bin, examples,
recipes, references, assets, delta, scripts, locales, brand-marks, migrations) and the root
`examples/` are upstream files.

**Verify it yourself — don't take our word** — [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
pins the upstream release tag, commit, and the SHA-256 of all 182 verbatim files with copy-paste
compare commands; `test/zero-regression.test.mjs` re-checks the pins on every `npm test` and
asserts the manifest covers `git ls-files archify examples` exactly.

Adaptations (official `@tt-a1i/archify-dsh@1.0.0` → `dsh-archify`): package name and resolution
path; `skills/` is generated by `npm run stage` and committed (upstream ships a prebuilt tarball);
upstream repo-root website/release files (`docs/`, `website/`, `README_EN.md`, `benchmarks/`,
`.github/`, …) are not part of the skill payload and were not ported.

**Testing strategy:** upstream moved its tests from `archify/test/` to the repo root `test/` in the
3.1 line, and the published payload (`archify.zip`) carries none; those tests resolve paths against
upstream's layout, so porting them would require rewriting them — which would break the
verbatim-payload guarantee. This fork proves the payload from the outside instead:

- `test/examples-parity.test.mjs` re-renders all 25 shipped example specs and byte-compares the 15
  that have a canonical upstream render (rendering is deterministic, so any drift in renderers,
  schemas, template, or embedded validators shows up here).
- `test/zero-regression.test.mjs` recomputes the SHA-256 manifest and checks coverage.

**Known limitation:** skill copy is English — that is upstream's original text, kept verbatim
(the 3.1 `locales/` only affects viewer UI copy inside generated diagrams).
</details>

## 🛠 Development

```bash
npm install          # no lifecycle scripts; nothing to build
npm run stage        # regenerate the committed skills/archify from archify/
npm test             # adapter contract tests + example render parity + hash manifest
node scripts/pack.mjs --out /tmp/dsh-archify.tgz   # build a tarball locally
```

`npm test` covers package/manifest contracts (version 0.2.0, zero dependencies, no lifecycle
scripts), the `cordis.patch.yml` insert block, tarball contents vs clean staging, `skills/` vs
`archify/` byte equality, the THIRD_PARTY_NOTICES hash manifest, and ten-type example parity
against upstream's canonical renders. `npm run test:skill` prints a skip reason when the upstream
suite is absent (see above).

## 📄 License

MIT. Upstream [`tt-a1i/archify`](https://github.com/tt-a1i/archify)
`Copyright (c) 2026 tt-a1i (Archify)`, `Copyright (c) 2025 Cocoon AI`,
this port `Copyright (c) 2026 GongYuanCaiJi (dsh port)`. See [LICENSE](./LICENSE).

Thanks to [tt-a1i](https://github.com/tt-a1i) — if this plugin is useful to you,
**star the [upstream repository](https://github.com/tt-a1i/archify) too**.
