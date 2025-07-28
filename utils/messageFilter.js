class MessageFilter {
  constructor(config) {
    this.botName = config.botName || 'YourBotName';
    this.botId = config.botId || 999;
  }

  // Parse SA:MP chat message format: (GROUP) [ID] PlayerName(PlayerID): message
  parseMessage(message) {
    // Regex to match: (GROUP) [20] metamorfosta(216): !test
    const regex = /^\(([^)]+)\)\s*\[(\d+)\]\s*([^(]+)\((\d+)\):\s*(.+)$/;
    const match = message.match(regex);
    
    if (!match) return null;
    
    return {
      group: match[1].trim(),
      groupId: parseInt(match[2]),
      playerName: match[3].trim(),
      playerId: parseInt(match[4]),
      message: match[5].trim(),
      fullMessage: message
    };
  }

  // Check if message should be sent to Discord
  shouldSendToDiscord(message) {
    const parsed = this.parseMessage(message);
    if (!parsed) return false;

    // Ignore messages from the bot itself
    if (parsed.playerName === this.botName || parsed.playerId === this.botId) {
      return false;
    }

    // Only send group messages that start with !
    return parsed.message.startsWith('!');
  }

  // Format message for Discord display
  formatForDiscord(message) {
    const parsed = this.parseMessage(message);
    if (!parsed) return message;

    return {
      embed: {
        color: 0x00ff00,
        title: `🎮 Group Command`,
        fields: [
          {
            name: 'Player',
            value: `${parsed.playerName} (ID: ${parsed.playerId})`,
            inline: true
          },
          {
            name: 'Group',
            value: `${parsed.group} [${parsed.groupId}]`,
            inline: true
          },
          {
            name: 'Command',
            value: `\`${parsed.message}\``,
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'SA:MP Group Command'
        }
      }
    };
  }
}
