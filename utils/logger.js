const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  logChat(message) {
    const timestamp = this.formatTimestamp();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    const logFile = path.join(this.logsDir, 'chat.log');
    fs.appendFileSync(logFile, logEntry, 'utf8');
  }

  logDialog(dialogData) {
    const timestamp = this.formatTimestamp();
    const logEntry = `[${timestamp}] Dialog ID: ${dialogData.dialog_id}, Title: "${dialogData.title}", Style: ${dialogData.dialog_style}\n`;
    
    const logFile = path.join(this.logsDir, 'dialog.log');
    fs.appendFileSync(logFile, logEntry, 'utf8');
  }

  logCommand(user, command, success) {
    const timestamp = this.formatTimestamp();
    const status = success ? 'SUCCESS' : 'FAILED';
    const logEntry = `[${timestamp}] [${status}] ${user}: ${command}\n`;
    
    const logFile = path.join(this.logsDir, 'commands.log');
    fs.appendFileSync(logFile, logEntry, 'utf8');
  }
}

module.exports = new Logger();