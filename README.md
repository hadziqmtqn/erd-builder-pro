# 💎 ERD Builder Pro

**ERD Builder Pro** is a modern, high-performance web application designed for developers and database architects to build, document, and visualize complex data structures with ease.

<div align="center">
  <img width="1200" alt="ERD Builder Pro Dashboard" src="https://lh3.googleusercontent.com/pw/AP1GczNpj0CJlqi-q6y6k3oSiQgyxcWDvniogCPptvpRX7jhLke6ZjCk89Z3od-62RJjDZ_q4A1sdBFIT9cxX-ft5yUswoNeBCdu3XqpMbpoRpXG5wN5SRwC5tP4ctPoH26BvGSi_RLilFsH8rW4tys3Uo7_=w2966-h1882-s-no-gm?authuser=1" />
</div>

## 🚀 Key Features

- **🎨 Multi-Mode Visual Editor**: 
  - **ERD Builder**: Drag-and-drop entity relationship diagramming using a high-performance node system.
  - **Excalidraw Integration**: Seamlessly switch to free-hand drawing for whiteboarding and brainstorming.
  - **Markdown Notes**: Built-in editor to document requirements, constraints, and business logic alongside your diagrams.
- **📁 Advanced Organization**:
  - **Project Management**: Group related files, notes, and drawings into distinct projects.
  - **Soft-Delete System**: Avoid data loss with a comprehensive "Trash" feature for all assets.
- **🔐 Enterprise-Ready**:
  - **Secure Authentication**: Built-in auth system with JWT and admin-only controls.
  - **Real-Time Persistence**: Every change is automatically saved to the cloud, ensuring your work is never lost.
- **🧠 AI Powered**: Leverages Google Gemini AI to assist in structural design and documentation.

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- **Visuals**: [React Flow](https://reactflow.dev/) + [Excalidraw](https://excalidraw.com/)
- **Backend**: [Express.js](https://expressjs.com/) with TypeScript (tsx)
- **Database / Auth**: [Supabase](https://supabase.com/)
- **Storage**: Cloudflare R2 (S3 Compatible)
- **AI**: [Google Generative AI (Gemini)](https://ai.google.dev/)

---

## 🏗️ Getting Started

Follow these steps to set up the project locally.

### 📋 Prerequisites

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **Supabase Account**: For database and authentication
- **Cloudflare R2 (Optional)**: For drawings and file attachments

### ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd erd-builder-pro
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (you can copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. **Update `.env` values**:
   Fill in your specific keys:

   | Variable | Description |
   | :--- | :--- |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin tasks |
   | `SUPABASE_STORAGE_BUCKET` | The bucket name for persistent data |
   | `R2_ACCOUNT_ID` | Cloudflare account ID |
   | `R2_ACCESS_KEY_ID` | R2 access key |
   | `R2_SECRET_ACCESS_KEY` | R2 secret key |
   | `R2_BUCKET_NAME` | S3-compatible bucket name |
   | `R2_PUBLIC_URL` | Public URL for serving R2 assets |
   | `JWT_SECRET` | Secret key for JWT token generation |
   | `ADMIN_EMAIL` | Initial admin email for login |
   | `ADMIN_PASSWORD` | Initial admin password |
   | `PORT` | Backend server port (default: 3000) |

5. **Run the Development Server**:
   ```bash
   npm run dev
   ```

   The application will be accessible at `http://localhost:3000`.

### 📦 Build & Production

To build the project for production:
```bash
npm run build
```
To start the production server:
```bash
npm run start
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Made with ❤️ for Developers</p>
