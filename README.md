# 💎 ERD Builder Pro

**ERD Builder Pro** is a professional-grade, high-performance web application designed for developers and database architects to build, document, and visualize complex data structures. Built with a modular architecture and modern tech stack, it offers a seamless experience for database design and technical documentation.

<div align="center">
  <img width="1200" alt="ERD Builder Pro Dashboard" src="https://lh3.googleusercontent.com/pw/AP1GczO1oWbiiyyEfI2MLyuHwWW-TVK1q5AihOBdqFZ61hh1xYhqJyO_vDf2p_5XAHKzwT4AuO1vw52gGfT0bjrEe5gvZ6-4tZglIZ-AbsH5cX-_wu2Z15SgiFphRnP7euMdtTgEycPrYpvjeX0V-P-E3NmC=w2966-h1882-s-no-gm?authuser=1" />
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
   Create a `.env` file in the root directory:
   ```bash
   # Backend Config
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   R2_ACCOUNT_ID=your_cloudflare_id
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   R2_BUCKET_NAME=your_bucket_name
   R2_PUBLIC_URL=your_public_cdn_url
   
   # Frontend Config (Vite)
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   
   # Server
   PORT=3000
   ```

4. **Start Development**:
   ```bash
   npm run dev
   ```
   Access the dashboard at `http://localhost:3000`.

### 📦 Deployment

Build the optimized production bundle:
```bash
npm run build
```
Run the production server:
```bash
npm run start
```

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

<p align="center">Built for Architects & Developers ❤️</p>
