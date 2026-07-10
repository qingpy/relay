# Relay

[English](README.md) | 中文

一个轻快、美观、跑在浏览器里的多服务商 LLM 聊天应用，供个人使用。
本地优先：数据就是你磁盘上的一个 JSON 文件，联网只用于调用模型和可选的
WebDAV 同步。

支持任意 OpenAI 兼容服务商及 Google Vertex AI。流式输出、分支对话、
Markdown / 代码 / 数学公式、文件上传、联网搜索、预设、导出。

![Demo](demo.jpeg)

## 用 Docker 运行

```bash
docker run -d --name relay -p 8787:8787 -v relay-data:/data \
  ghcr.io/qingpy/relay:latest
```

打开 http://localhost:8787。快照、密钥、备份都存放在 `relay-data` 卷中；
想放在看得见的目录，改用绑定挂载 `-v /path/on/host:/data`。请只在本机使用：
代理没有鉴权，能访问到端口的人就能用你的密钥。

## 直接运行构建产物

需 Node 20+，无需构建：从[最新 Release](https://github.com/qingpy/relay/releases/latest)
下载 `relay-x.y.z.zip`，解压后运行 `node server-dist/index.js`，
打开 http://localhost:8787。

## 从源码运行

需要 Node 20+。

```bash
npm install
npm run dev      # Vite + 代理；打开 http://localhost:5173
```

生产模式：`npm run build && npm run serve`（应用与 API 同源，`:8787`）。
代理必须保持运行，数据文件由它管理。其他脚本：`npm run typecheck`、
`npm run dev:web` / `dev:server`。

## 你的数据

唯一的数据源是代理管理的一个 JSON 文件（默认 `./data/relay.json`；
浏览器只持有内存副本）。路径和大小见 设置 → Sync & backup。

密钥（API key、Vertex 私钥、WebDAV 密码）存放在代理独立的密钥文件里，
因此数据文件、备份和 WebDAV 镜像都不含凭据，可以放心拷贝；换设备后重新
填一次密钥即可。

可选的 WebDAV 同步会把快照镜像到多台设备（后写覆盖，应用打开时生效），
并保留滚动的带时间戳备份。也可以下载或在磁盘上保存便携的 JSON 备份。

## 服务商

无需登录。在 设置 → Connections 中添加连接：

- 自定义：填入完整的 OpenAI 兼容 API 地址（如 `…/v1/chat/completions`）
  和 API key。
- Vertex AI：粘贴服务账号 JSON，私钥只留在服务端。

预设为其中的聊天固定模型、参数和系统提示词；按模型标记的能力
（视觉、PDF、推理、联网、工具）决定输入框可用的功能。

## 环境变量（均可选）

| 变量                                  | 用途                            | 默认值              |
| ------------------------------------- | ------------------------------- | ------------------- |
| `RELAY_DATA_FILE`                     | 数据快照路径                    | `./data/relay.json` |
| `RELAY_SECRETS_FILE`                  | 密钥文件（key + WebDAV 密码）   | 用户配置目录        |
| `API_PORT`                            | 代理端口                        | `8787`              |
| `RELAY_BACKUP_DIR`                    | 磁盘备份目录                    | `./backups`         |
| `OPENROUTER_KEY` / `OPENAI_KEY`       | OpenAI 式连接的后备 key         | -                   |
| `GOOGLE_VERTEX_CREDENTIALS` / `_FILE` | 后备 Vertex 服务账号            | -                   |

## 技术栈

React 19、TypeScript strict、Vite 6、Tailwind v4、shadcn/Radix、
Dexie（内存 IndexedDB）、Zustand、Node 上的 Hono 代理。依赖极少。
构建细节见 ARCHITECTURE.md。

---

感谢 [linux.do](https://linux.do/) 社区。
