const fs = require('fs');
const path = require('path');
const logPath = path.join(__dirname, '../logs/chat.log');

module.exports = {
  log: (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logPath, line);
  }
};
