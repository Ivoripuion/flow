<h1 align="center"><a href="https://flowoss.com">Flow - Open Source Software (OSS)</a></h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<h2 align="center">Redefine ePub reader</h2>

<p align="center">Free. Open source. Browser-based.</p>

<p align="center"><img src="apps/website/public/screenshots/01.webp"/>

</p>

## Features

- Grid layout
- Search in book
- Image preview
- Custom typography
- Highlight and Annotation
- Theme
- Share/Download book with link
- Data export
- Cloud storage
- **AI-powered features**:
  - Knowledge Base (RAG) - Upload PDFs and build a searchable knowledge base
  - Smart Translation - Context-aware translation with knowledge base integration
  - Page Summarization - AI-generated summaries with knowledge base context
  - Streaming Output - Real-time token-by-token display
  - Configurable Context Length - Adjust how much knowledge base context to include

For planed features, see our [roadmap](https://pacexy.notion.site/283696d0071c43bfb03652e8e5f47936?v=b43f4dd7a3cb4ce785d6c32b698a8ff5).

## Quick Start

The easiest way to get started is using our one-click startup scripts:

### Windows

Double-click `start.bat` or run in terminal:

```bash
start.bat
```

### Mac/Linux

Open terminal and run:

```bash
chmod +x start.sh
./start.sh
```

**Mac users**: You can also double-click `start.sh` in Finder after setting execute permissions.

The script will:

- ✅ Check if Node.js 18+ is installed
- ✅ Auto-install pnpm if missing
- ✅ Create default configuration file
- ✅ Install dependencies
- ✅ Start the application
- ✅ Open browser automatically after ~5 seconds

After startup, visit: **http://localhost:7127**

**Note**: The browser opens after a 5-second delay to allow Next.js to compile the application. If the page shows "not accessible", wait a few more seconds and refresh.

### Prerequisites

- [Node.js](https://nodejs.org) (version 18 or higher)
- [pnpm](https://pnpm.io/installation) (auto-installed by the script)
- [Git](https://git-scm.com/downloads)

## AI Features

Flow integrates AI capabilities to enhance your reading experience through Retrieval-Augmented Generation (RAG).

### Configuration

1. Click the **AI Assistant** button (floating button on the reading page)
2. Click the **Settings** icon to configure:
   - **API Key**: Your OpenAI-compatible API key (e.g., OpenAI, Azure OpenAI, 阿里百炼)
   - **API URL**: API endpoint (default: `https://api.openai.com/v1`)
   - **Model Name**: Chat model (e.g., `gpt-4`, `qwen-plus`)
   - **Embedding Model**: Embedding model (e.g., `text-embedding-3-small`, `text-embedding-v3`)
   - **Context Length**: How many characters from each knowledge base entry to include (default: 1000)

Configuration is saved in your browser's localStorage and never sent to any server except your configured API endpoint.

### Knowledge Base

The Knowledge Base feature allows you to build a local RAG system:

1. **Select Storage Folder**: Click "Select Folder" to choose where to store the SQLite database
2. **Upload PDFs**: Click "Upload PDF" and select PDF files
3. **Automatic Processing**:
   - PDF parsing and text extraction
   - Chunking (splitting into ~500 character segments)
   - Vector embedding generation
   - Storage in local SQLite database
4. **Enable/Disable**: Toggle knowledge bases on/off to control which ones are used for context

**Performance**: Batch embedding API calls reduce processing time by 10-50x compared to single requests.

### Using AI Features

#### Translation

**Select Text Translation**:

- Select any text in the book
- Click "Translate" in the popup menu
- Translation appears with streaming output (token-by-token)
- Automatically includes relevant knowledge base context

**Full Page Translation**:

- Click the AI Assistant button
- Click "Translate Page"
- Translates all paragraphs on the current page concurrently (3x-5x faster than sequential)
- Progress bar shows real-time completion status
- Translations are inserted below each original paragraph

#### Summarization

- Click the AI Assistant button
- Click "Summarize"
- AI generates a summary of the current page
- Uses knowledge base context for better accuracy
- Streaming output with "Stop" button to cancel
- Summary appears in a modal dialog

### How RAG Works

1. **Query**: When you translate or summarize, the current text is embedded into a vector
2. **Search**: Cosine similarity search finds the top 3 most relevant chunks in your knowledge base
3. **Context Building**: Relevant chunks are formatted as reference material
4. **Prompt Injection**: Context is prepended to your prompt
5. **Generation**: AI model generates response with knowledge base context

Example prompt structure:

```
参考以下资料：
[参考资料1]
{knowledge base chunk 1}

[参考资料2]
{knowledge base chunk 2}

请将以下文本翻译成中文，保持原文的格式和风格：

{selected text}
```

### Supported API Providers

Flow works with any OpenAI-compatible API:

- **OpenAI**: `https://api.openai.com/v1`
- **Azure OpenAI**: Your Azure endpoint
- **阿里百炼 (Alibaba Cloud)**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **Local Models**: Ollama, LM Studio, etc. (with OpenAI-compatible API)

### Privacy & Security

- **Local Storage**: Knowledge base database (SQLite) is stored locally in your browser
- **No Server**: AI configuration and knowledge base data never leave your device
- **Direct API Calls**: Requests go directly from your browser to your configured API endpoint
- **No Tracking**: No analytics or telemetry for AI features

## Development

### Prerequisites

- [Node.js](https://nodejs.org)
- [pnpm](https://pnpm.io/installation)
- [Git](https://git-scm.com/downloads)

### Clone the repo

```bash
git clone https://github.com/pacexy/flow
```

### Install the dependencies

```bash
pnpm i
```

### Setup the environment variables

Copy and rename all `.env.local.example`s to `.env.local` and setup the environment variables.

### Run the apps

```bash
pnpm dev
```

## Self-hosting

Before self-hosting, you should [setup the environment variables](#setup-the-environment-variables).

### Docker

You can use docker-compose:

```sh
docker compose up -d
```

Or build the image and run it manually:

```sh
docker build -t flow .
docker run -p 3000:3000 --env-file apps/reader/.env.local flow
```

## Contributing

There are many ways in which you can participate in this project, for example:

- [Submit bugs and feature requests](https://github.com/pacexy/flow/issues/new), and help us verify as they are checked in
- [Submit pull requests](https://github.com/pacexy/flow/pulls)

## Credits

- [Epub.js](https://github.com/futurepress/epub.js/)
- [React](https://github.com/facebook/react)
- [Next.js](https://nextjs.org/)
- [TypeScript](https://www.typescriptlang.org)
- [Vercel](https://vercel.com)
- [Turborepo](https://turbo.build/repo)
