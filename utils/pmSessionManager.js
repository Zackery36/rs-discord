const sessions = new Map();

module.exports = {
  startSession(channelId, timeoutCallback) {
    this.endSession(channelId);
    
    const timeout = setTimeout(() => timeoutCallback(), 30000);
    sessions.set(channelId, { timeout });
    console.log(`[PM] Started session for channel ${channelId}`);
  },
  
  resetSession(channelId, timeoutCallback) {
    const session = sessions.get(channelId);
    if (session) {
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => timeoutCallback(), 30000);
      console.log(`[PM] Reset session for channel ${channelId}`);
    }
  },
  
  endSession(channelId) {
    const session = sessions.get(channelId);
    if (session) {
      clearTimeout(session.timeout);
      sessions.delete(channelId);
      console.log(`[PM] Ended session for channel ${channelId}`);
    }
  },
  
  hasSession(channelId) {
    return sessions.has(channelId);
  }
};