# Paper AI Enhanced

一个面向论文追踪的多源爬取与 AI 增强项目。当前版本支持从 `arXiv`、`bioRxiv`、`medRxiv`、`PubMed` 抓取论文，做关键词硬过滤、AI 摘要增强，并用纯静态前端展示结果。

当前仓库默认配置已经调整为更适合 `PD-L1` 靶点抗体方向的抓取与筛选。

## 功能

- 多源抓取：`arXiv`、`bioRxiv`、`medRxiv`、`PubMed`
- 统一数据格式：不同来源归一化到同一套字段
- 关键词过滤：支持 `keywords` 和 `keyword_groups`
- AI 增强：对抓到的论文做标题、摘要、总结等增强
- 静态前端：直接读取 `data/` 里的结果文件，无需后端服务

## 项目结构

```text
daily_arxiv/              Scrapy 爬虫与配置
ai/                       AI 增强脚本
data/                     爬取结果与增强结果
assets/file-list.txt      前端读取的数据文件索引
index.html                前端首页
run.sh                    本地一键跑完整流程
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

这个脚本会做 4 件事：

1. 按当前配置抓取论文
2. 做去重检查
3. 运行 AI 增强
4. 生成前端使用的数据文件

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

## 启动前端

前端是纯静态页面，没有 Node 构建步骤，直接起一个静态文件服务即可。

在仓库根目录运行：

```bash
uv run python -m http.server 8000
```

然后在浏览器打开：

```text
http://127.0.0.1:8000/
```

前端会读取：

- `assets/file-list.txt`
- `data/*.jsonl`

如果你已经重新爬过并生成了新数据，刷新页面就能看到结果。

## 前端说明

- 首页、设置页、统计页都是静态页面
- 前端设置只写入浏览器 `localStorage`
- 前端设置不会修改爬虫配置、模型配置或 API key

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
