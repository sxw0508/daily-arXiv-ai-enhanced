# Paper AI Enhanced

一个面向论文追踪的多源爬取与 AI 增强项目。当前版本支持从 `arXiv`、`bioRxiv`、`medRxiv`、`PubMed` 抓取论文，做关键词硬过滤、AI 摘要增强，并用 Web 前端展示结果；在本地或服务器上启动 **`local_console.py`** 后，可在浏览器里保存爬虫配置、触发「仅爬取」或「完整流水线」等操作。

当前仓库默认配置已经调整为更适合 `PD-L1` 靶点抗体方向的抓取与筛选。

## 功能

- 多源抓取：`arXiv`、`bioRxiv`、`medRxiv`、`PubMed`
- 统一数据格式：不同来源归一化到同一套字段
- 关键词过滤：支持 `keywords` 和 `keyword_groups`
- AI 增强：对抓到的论文做标题、摘要、总结等增强
- Web 前端：读取 `data/` 与 `assets/file-list.txt`；配合 **`local_console.py`** 时提供控制 API（配置与任务），无需单独 Node 构建

## 项目结构

```text
daily_arxiv/              Scrapy 爬虫与配置
ai/                       AI 增强脚本
data/                     爬取结果与增强结果
assets/file-list.txt      前端读取的数据文件索引
index.html                前端首页
local_console.py          本地/服务端控制台：静态资源 + /api/control/*
run.sh                    一键跑完整流程（或由控制台在后台调用）
```

## 环境准备

项目内统一使用 `uv`。

```bash
uv sync --locked
```

## 配置

项目有两层配置文件：

- [daily_arxiv/config.yaml](./daily_arxiv/config.yaml)：可提交的默认配置
- `daily_arxiv/config.local.yaml`：本地私有配置，已加入 `.gitignore`

配置优先级：

```text
环境变量 > config.local.yaml > config.yaml > 代码默认值
```

建议把模型密钥放在 `daily_arxiv/config.local.yaml`：

```yaml
llm:
  openai_api_key: your-api-key
  openai_base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model_name: qwen3.6-plus
  language: Chinese
```

爬虫默认关键词、分组和时间窗在 [daily_arxiv/config.yaml](./daily_arxiv/config.yaml) 里：

- `crawler.paper_sources`
- `crawler.biorxiv_categories`
- `crawler.medrxiv_categories`
- `crawler.keywords`
- `crawler.keyword_groups`
- `crawler.rxiv_lookback_days`
- `pubmed.query`

## 运行完整流程

一键跑完整链路：

```bash
bash run.sh
```

主要步骤包括：按配置抓取、去重并合并到当日 `data/*.jsonl`、（在已配置 API 密钥时）运行 AI 增强与 Markdown 转换、更新 `assets/file-list.txt`。

生成物默认在 `data/` 下，例如：

- `data/YYYY-MM-DD.jsonl`
- `data/YYYY-MM-DD_AI_enhanced_Chinese.jsonl`
- `data/YYYY-MM-DD.md`

## 手动运行

如果你想拆开执行，可以按下面跑。

抓取：

```bash
cd daily_arxiv
uv run scrapy crawl papers -O ../data/$(date -u +%F).jsonl
```

AI 增强：

```bash
cd ai
uv run python enhance.py --data ../data/YYYY-MM-DD.jsonl
```

## 启动 Web（推荐：本地控制台）

前端没有 Node 构建步骤。若要使用**设置页 / 控制台里保存配置、启动爬取或完整流水线**，必须在仓库根目录启动 **`local_console.py`**（它会同时托管页面与 `/api/control/*` 接口）：

```bash
uv run python local_console.py
```

默认监听 **`127.0.0.1:8000`**（仅本机）。浏览器访问：

```text
http://127.0.0.1:8000/
```

控制台相关接口包括（均由 `local_console.py` 提供）：

- `GET /api/control/state`：当前配置、任务状态、近期数据文件
- `POST /api/control/config`：将表单中的爬虫与 LLM（非密钥）字段写回 [daily_arxiv/config.yaml](./daily_arxiv/config.yaml)
- `POST /api/control/run`：启动 `run.sh`（`full`）或 `run.sh --crawl-only`（`crawl`）
- `POST /api/control/stop`：终止当前子进程
- `POST /api/control/generate`：靶点工作室等场景的检索计划生成

前端数据仍来自：

- `assets/file-list.txt`
- `data/*.jsonl`

任务跑完后刷新页面即可看到新结果。

### 仅预览数据（无控制台）

若你**不需要**在浏览器里改配置或点「运行」，只需要看已有 `data/`，可以用任意静态服务器，例如：

```bash
uv run python -m http.server 8000
```

此时 `/api/control/*` **不可用**，设置里的「保存 / 运行」会提示控制 API 未就绪。

## 一键部署

仓库提供一键部署脚本 [scripts/deploy_local_console.sh](./scripts/deploy_local_console.sh)：以 `sudo` 执行后会把 `local_console.py` 注册为 systemd 服务（`daily-arxiv-console`），由控制台进程自身监听 `LISTEN_HOST:LISTEN_PORT`（默认 `0.0.0.0:23324`），无需 Nginx。可通过 `FRONTEND_PASSWORD` 环境变量设置前端登录密码（脚本会把其 SHA-256 写入 `js/auth-config.js`）。

```bash
sudo bash scripts/deploy_local_console.sh
```

> 注意：`/api/control/*` 没有服务端鉴权，仅由前端 `login.html` 拦截。若 `LISTEN_HOST` 暴露到公网，请额外配置防火墙、VPN 或反代鉴权。

## 前端说明

- 页面为静态 HTML/JS/CSS，无打包步骤。
- 在 **`local_console.py` 未启动**或仅使用 `python -m http.server` 时：部分交互只影响浏览器 `localStorage`，且无法调用控制 API。
- 在 **`local_console.py` 已启动**且同源访问时：设置/控制台会通过 `POST /api/control/config` 更新仓库里的 [daily_arxiv/config.yaml](./daily_arxiv/config.yaml)（爬虫、PubMed、LLM 的模型名/语言/接口地址等）；**API key 仍只应从 `config.local.yaml` 或环境变量提供**，控制台只回显「是否已配置密钥」，不会把密钥写给前端。

## GitHub Actions

如果你想让仓库每天自动跑，可以直接用 [.github/workflows/run.yml](./.github/workflows/run.yml)。

需要的核心配置有两类：

- `Secrets`
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`
  - 可选：`NCBI_API_KEY`
- `Variables`
  - `PAPER_SOURCES`
  - `ARXIV_CATEGORIES`
  - `BIORXIV_CATEGORIES`
  - `MEDRXIV_CATEGORIES`
  - `PUBMED_QUERY`
  - `PUBMED_LABEL`
  - `KEYWORDS`
  - `KEYWORD_GROUPS`
  - `RXIV_LOOKBACK_DAYS`
  - `PUBMED_RETMAX`
  - `PUBMED_DATE_TYPE`
  - `LANGUAGE`
  - `MODEL_NAME`

## 当前默认方向

当前默认配置针对 `PD-L1` 靶点抗体方向，主要来自：

- `PubMed` 检索式约束
- `bioRxiv/medRxiv` 的分类约束
- `PD-L1 + 抗体名` 的关键词分组过滤

如果你想切换到别的靶点，优先改 [daily_arxiv/config.yaml](./daily_arxiv/config.yaml)。
