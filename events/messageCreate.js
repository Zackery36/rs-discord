// events/messageCreate.js
const axios = require('axios');

module.exports = (config) => async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const cmd = message.content.slice(config.prefix.length).trim();
  console.log(`[Discord→SA:MP] sending to ${config.raksampHost}:${config.raksampPort} -> "${cmd}"`);

  const body = `message=!${encodeURIComponent(cmd)}`;

  try {
    await axios.post(
      `http://${config.raksampHost}:${config.raksampPort}/`,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    message.react('✅');
  } catch (err) {
    console.error('Error POSTing to SA:MP listener:', err.message);
    message.react('❌');
  }
};
