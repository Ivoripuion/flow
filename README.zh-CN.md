<h1 align="center"><a href="https://flowoss.com">Flow - 开源软件 (OSS)</a></h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<h2 align="center">重新定义 ePub 阅读器</h2>

<p align="center">免费、开源、基于浏览器。</p>

<p align="center"><img src="apps/website/public/screenshots/01.webp"/>

</p>

## 功能特性

- 网格布局
- 书内搜索
- 图片预览
- 自定义排版
- 高亮和批注
- 主题切换
- 链接分享/下载书籍
- 数据导出
- 云存储
- **AI 智能功能**：
  - 知识库 (RAG) - 上传 PDF 并构建可检索的知识库
  - 智能翻译 - 结合知识库上下文的语境感知翻译
  - 页面摘要 - AI 生成摘要，结合知识库上下文
  - 流式输出 - 实时逐字显示
  - 可配置上下文长度 - 调整知识库上下文包含量

计划中的功能请查看我们的 [路线图](https://pacexy.notion.site/283696d0071c43bfb03652e8e5f47936?v=b43f4dd7a3cb4ce785d6c32b698a8ff5)。

## 快速开始

最简单的启动方式是使用我们的一键启动脚本：

### Windows

双击 `start.bat` 或在终端中运行：

```bash
start.bat
```

### Mac/Linux

打开终端并运行：

```bash
chmod +x start.sh
./start.sh
```

**Mac 用户**：设置可执行权限后，也可以在 Finder 中双击 `start.sh` 运行。

脚本会自动完成以下操作：

- ✅ 检测 Node.js 18+ 是否已安装
- ✅ 如果缺少 pnpm 则自动安装
- ✅ 创建默认配置文件
- ✅ 安装项目依赖
- ✅ 启动应用
- ✅ 约 5 秒后自动打开浏览器

启动后访问：**http://localhost:7127**

**注意**：浏览器会在 5 秒延迟后打开，以便 Next.js 完成编译。如果页面显示"无法访问"，请再等几秒后刷新。

### 环境要求

- [Node.js](https://nodejs.org)（18 或更高版本）
- [pnpm](https://pnpm.io/installation)（脚本会自动安装）
- [Git](https://git-scm.com/downloads)

## AI 功能

Flow 集成了 AI 能力，通过检索增强生成 (RAG) 技术提升您的阅读体验。

### 配置

1. 点击 **AI 助手** 按钮（阅读页面上的浮动按钮）
2. 点击 **设置** 图标进行配置：
   - **API Key**：您的 OpenAI 兼容 API 密钥（如 OpenAI、Azure OpenAI、阿里百炼）
   - **API URL**：API 端点（默认：`https://api.openai.com/v1`）
   - **模型名称**：对话模型（如 `gpt-4`、`qwen-plus`）
   - **嵌入模型**：向量嵌入模型（如 `text-embedding-3-small`、`text-embedding-v3`）
   - **上下文长度**：每个知识库条目包含的字符数（默认：1000）

配置保存在浏览器的 localStorage 中，除了您配置的 API 端点外，不会发送到任何服务器。

### 知识库

知识库功能允许您构建本地 RAG 系统：

1. **选择存储目录**：点击"选择文件夹"选择 SQLite 数据库的存储位置
2. **上传 PDF**：点击"上传 PDF"并选择 PDF 文件
3. **自动处理**：
   - PDF 解析和文本提取
   - 分块（拆分为约 500 字符的段落）
   - 向量嵌入生成
   - 存储到本地 SQLite 数据库
4. **启用/禁用**：切换知识库的启用状态，控制哪些知识库用于上下文

**性能**：批量嵌入 API 调用相比单条请求，处理时间缩短 10-50 倍。

### 使用 AI 功能

#### 翻译

**选中文本翻译**：

- 在书中选中任意文本
- 在弹出菜单中点击"翻译"
- 翻译结果以流式输出逐字显示
- 自动包含相关知识库上下文

**整页翻译**：

- 点击 AI 助手按钮
- 点击"页面翻译"
- 并发翻译当前页面的所有段落（比串行快 3-5 倍）
- 进度条实时显示完成状态
- 翻译结果插入到每个原始段落下方

#### 摘要

- 点击 AI 助手按钮
- 点击"总结"
- AI 生成当前页面的摘要
- 使用知识库上下文提高准确性
- 流式输出，带有"停止"按钮可取消
- 摘要显示在模态对话框中

### RAG 工作原理

1. **查询**：当您翻译或总结时，当前文本被嵌入为向量
2. **搜索**：余弦相似度搜索在知识库中找到最相关的前 3 个文本块
3. **上下文构建**：相关文本块被格式化为参考资料
4. **提示注入**：上下文被添加到提示词前面
5. **生成**：AI 模型结合知识库上下文生成回复

提示词结构示例：

```
参考以下资料：
[参考资料1]
{知识库文本块 1}

[参考资料2]
{知识库文本块 2}

请将以下文本翻译成中文，保持原文的格式和风格：

{选中的文本}
```

### 支持的 API 提供商

Flow 兼容任何 OpenAI 兼容 API：

- **OpenAI**：`https://api.openai.com/v1`
- **Azure OpenAI**：您的 Azure 端点
- **阿里百炼**：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- **本地模型**：Ollama、LM Studio 等（支持 OpenAI 兼容 API）

### 隐私与安全

- **本地存储**：知识库数据库 (SQLite) 存储在您的浏览器本地
- **无服务器**：AI 配置和知识库数据不会离开您的设备
- **直接 API 调用**：请求直接从您的浏览器发送到您配置的 API 端点
- **无追踪**：AI 功能不包含任何分析或遥测

## 开发

### 环境要求

- [Node.js](https://nodejs.org)
- [pnpm](https://pnpm.io/installation)
- [Git](https://git-scm.com/downloads)

### 克隆仓库

```bash
git clone https://github.com/pacexy/flow
```

### 安装依赖

```bash
pnpm i
```

### 配置环境变量

复制所有 `.env.local.example` 文件并重命名为 `.env.local`，然后配置环境变量。

### 运行应用

```bash
pnpm dev
```

## 自部署

在自部署之前，您需要 [配置环境变量](#配置环境变量)。

### Docker

您可以使用 docker-compose：

```sh
docker compose up -d
```

或者手动构建镜像并运行：

```sh
docker build -t flow .
docker run -p 3000:3000 --env-file apps/reader/.env.local flow
```

## 贡献

您可以通过多种方式参与这个项目，例如：

- [提交 bug 和功能请求](https://github.com/pacexy/flow/issues/new)，帮助我们验证和改进
- [提交 Pull Request](https://github.com/pacexy/flow/pulls)

## 致谢

- [Epub.js](https://github.com/futurepress/epub.js/)
- [React](https://github.com/facebook/react)
- [Next.js](https://nextjs.org/)
- [TypeScript](https://www.typescriptlang.org)
- [Vercel](https://vercel.com)
- [Turborepo](https://turbo.build/repo)
