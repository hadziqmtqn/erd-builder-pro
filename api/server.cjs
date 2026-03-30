const path = require('path');

// Register ts-node with specific settings
require('ts-node').register({
  transpileOnly: true,
  esm: true, // Crucial for Vite-based projects
  compilerOptions: {
    module: "CommonJS",
    target: "ES2020",
    esModuleInterop: true,
    allowJs: true
  }
});

const serverPath = path.resolve(__dirname, '../server.ts');
const serverModule = require(serverPath);

module.exports = async (req, res) => {
  try {
    const app = await serverModule.default;
    return app(req, res);
  } catch (err) {
    console.error("Vercel Invocation Error:", err);
    res.status(500).json({ 
      error: "FUNCTION_INVOCATION_FAILED", 
      message: err.message,
      stack: err.stack 
    });
  }
};
