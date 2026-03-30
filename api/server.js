// Register ts-node to allow loading .ts files
require('ts-node/register');

// Import the main server file
const serverModule = require('../server.ts');

// Export the app as handler
module.exports = async (req, res) => {
  const app = await serverModule.default;
  return app(req, res);
};
