# 💎 ERD Builder Pro

> [!WARNING]
> **ERD Builder Pro** is under active development and not yet stable — features and config may still change. Give the repo a Star ⭐ and Watch 👀 it to get notified the moment a release lands.

<div align="center">

[![Docker Hub](https://img.shields.io/badge/docker-available-blue?logo=docker)](https://hub.docker.com/r/bekenweb/erd-builder-pro)
[![Docker Pulls](https://img.shields.io/docker/pulls/bekenweb/erd-builder-pro)](https://hub.docker.com/r/bekenweb/erd-builder-pro)
[![Docker Image Size](https://img.shields.io/docker/image-size/bekenweb/erd-builder-pro/latest)](https://hub.docker.com/r/bekenweb/erd-builder-pro)

</div>

**ERD Builder Pro** is a professional-grade, high-performance web application designed for developers and database architects to build, document, and visualize complex data structures. Built with a modular architecture and modern tech stack, it offers a seamless experience for database design and technical documentation.

<div align="center">
  <img width="1200" alt="ERD Builder Pro Dashboard" src="public/img/erd-intro.png" />
</div>

## 🚀 Key Features

- **🎨 Multi-Mode Visual Workspace**: 
  - **ERD Builder**: Drag-and-drop entity relationship diagramming using **XYFlow** (React Flow v12).
  - **Interactive Flowcharts**: Visualize processes and architectures with customizable nodes, decision points, and smart connectors.
  - **Excalidraw Integration**: Free-hand sketching for whiteboarding and architectural brainstorming.
  - **Rich Text Notes**: Professional documentation powered by **TipTap**, supporting tables, task lists, and markdown.
- **🏗️ Modular Architecture**:
  - **Component-Based Views**: Clean separation of concerns with dedicated views for ERD, Notes, Drawings, and Trash.
  - **Scalable Design**: Easily extendable codebase with a decoupled frontend/backend structure.
- **📤 Advanced Export Options**:
  - **SQL Schema Generation**: Export diagrams directly to **PostgreSQL** or **MySQL** DDL scripts.
  - **Universal Formats**: High-quality Image and PDF exports for documentation sharing.
- **📁 Smart Organization**:
  - **Project Management**: Group related assets into distinct projects for better workspace management.
  - **Comprehensive Trash System**: Safety-first soft-delete system for all projects and files.
- **🤖 AI-Powered Assistant**: Context-aware chat integrated per view — ask about diagrams, generate SQL/seed data, summarize notes, or describe flowcharts. Streaming responses with auto-apply (Replace/Append). Supports multi-table selection, markdown-aware notes context. AI can reference multiple file types within the same workspace (e.g., chat about a Note while AI also sees the ERD diagram and Flowchart), enabling cross-feature analysis.
- **🔐 Enterprise-Grade Security**:
  - **Supabase Authentication**: Secure Email/Password login system with persistent session management.
  - **Cloud Hybrid Storage**: Real-time persistence using **Supabase Database** and **Cloudflare R2**.

## 🛠️ Tech Stack

- **Frontend**: [React 18](https://reactjs.org/) + [Vite 6](https://vite.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- **UI System**: [Shadcn UI](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) + [Lucide Icons](https://lucide.dev/)
- **Canvas Engines**: [XYFlow](https://xyflow.com/) + [Excalidraw](https://excalidraw.com/)
- **Content Editor**: [TipTap](https://tiptap.dev/) (Rich Text Engine)
- **Backend Architecture**: [Express.js](https://expressjs.com/) + [Edge Functions Support](https://vercel.com/docs/functions/edge-functions)
- **Infrastructure**: [Supabase](https://supabase.com/) (DB/Auth) + [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (Storage)

---

## 🏗️ Getting Started

### � Documentation
For detailed guides and tutorials, visit: [https://docs.erdbuilderpro.com](https://docs.erdbuilderpro.com)

### 📋 Prerequisites
- **Node.js**: v20+ 
- **npm**: v10+
- **Supabase Account**: For Database and Authentication management
- **Cloudflare R2 / S3 Account**: For storing large assets (drawings/attachments)

### ⚙️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd erd-builder-pro
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory and follow the configuration guide:
   [https://docs.erdbuilderpro.com/configuration/env-variables](https://docs.erdbuilderpro.com/configuration/env-variables)

   Use [`./.env.example`](./.env.example) as the local template. Do not commit real secret values into the repo or README.

4. **Start Development**:
   ```bash
   npm run dev
   ```
   Access the dashboard at `http://localhost:3000`.

### 🐳 Docker

```bash
docker pull bekenweb/erd-builder-pro:latest

docker run -d --name erd-builder-pro -p 3000:3000 \
  --env-file .env \
  bekenweb/erd-builder-pro:latest
```

> Fill `.env` based on the [env configuration docs](https://docs.erdbuilderpro.com/configuration/env-variables) and [`.env.example`](./.env.example). Vite build args (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are baked into the image — use the appropriate tag or build your own with `docker build --build-arg VITE_SUPABASE_URL=... -t erd-builder-pro .`

Available tags: [`latest`](https://hub.docker.com/r/bekenweb/erd-builder-pro/tags), versioned (`v1.2.3`), and commit SHA (`2bbc233`).

### 📦 Local Build

Build the optimized production bundle:
```bash
npm run build
```
Run the production server:
```bash
npm run start
```

### 🧪 Testing

The project uses [Vitest](https://vitest.dev/) for unit testing with a focus on core logic — SQL parsers, schema diff engine, auto-layout algorithms, and code generators.

**Test commands**:
```bash
npm test            # Run all tests once
npm run test:watch  # Run in watch mode during development
```

**Test structure**:
```
src/lib/__tests__/
├── sqlParser.test.ts          # SQL DDL parser (17 tests)
├── schema-diff.test.ts        # Schema comparison engine (8 tests)
├── autoLayoutERD.test.ts      # ERD auto-layout algorithm (12 tests)
├── autoLayoutFlowchart.test.ts # Flowchart auto-layout algorithm (12 tests)
├── sql-generator.test.ts      # Code generation for 7 dialects (39 tests)
└── sql-generator-all.test.ts  # Bulk export & FK extraction (19 tests)
```

**Coverage areas**: SQL DDL parsing across PostgreSQL/MySQL/SQLite dialects, schema diff & merge resolution, directed-graph auto-layout (BFS layering, cycle detection, diamond decision branching), and multi-dialect code generation (MySQL, PostgreSQL, Laravel, TypeScript, Prisma, Zod).

---

## 🤝 Sponsors

A huge thank you to our sponsors for providing the infrastructure and tools that make this project possible:

<div align="center">
  <a href="https://www.idcloudhost.com" target="_blank">
    <img src="https://raw.githubusercontent.com/khadziq/erd-builder-pro/main/public/img/sponsors/IDCloudhost.png" alt="IDCloudhost" height="60" />
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://doktainer.com" target="_blank">
    <img src="https://raw.githubusercontent.com/khadziq/erd-builder-pro/main/public/img/sponsors/Doktainer.png" alt="Doktainer" height="60" />
  </a>
</div>

| Sponsor | Support |
|---------|---------|
| [**IDCloudhost**](https://www.idcloudhost.com) | Virtual machine infrastructure for deployment and cloud hosting. |
| [**Doktainer**](https://doktainer.com) | App template platform with Docker panel for streamlined container management. |

---

## 💖 Support

If you find ERD Builder Pro useful, consider supporting the developer:

<a href="https://trakteer.id/khadziq_muttaqin/tip" target="_blank"><img src="https://edge-cdn.trakteer.id/images/embed/trbtn-red-1.png?v=14-05-2025" height="40" style="border:0;height:40px;" alt="Trakteer Saya"></a>

---

## 📄 License

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](./LICENSE)**. 

### 🚫 Non-Commercial Use Only
The software is free to use, modify, and distribute for **non-commercial purposes only**. Any use for revenue-generating activities or within for-profit organizations is strictly prohibited under these terms.

### 💼 Commercial Licensing
If you wish to use ERD Builder Pro for commercial purposes, business operations, or as part of a paid service, you must obtain a separate commercial license. Please contact the author for further information.

---

<p align="center">Built for Architects & Developers ❤️</p>
