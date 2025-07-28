const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get player statistics')
    .addIntegerOption(opt =>
      opt.setName('id')
        .setDescription('Player ID')
        .setRequired(true)),

  async execute(interaction, config) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const playerId = interaction.options.getInteger('id');
    const client = interaction.client;

    // Utility to wait for dialog
    function waitForDialog(filter, timeout) {
      return new Promise(resolve => {
        const handler = dlg => {
          if (filter(dlg)) {
            cleanup();
            resolve(dlg);
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, timeout);
        function cleanup() {
          clearTimeout(timer);
          client.off('dialog', handler);
        }
        client.on('dialog', handler);
      });
    }

    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
      
      // Send stats command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent(`/stats ${playerId}`)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for stats dialog
      const dialog = await waitForDialog(
        d => d.title.toLowerCase().includes("player stats") || 
             d.title.toLowerCase().includes("statistics"),
        5000
      );

      if (!dialog) {
        return await interaction.editReply('❌ Statistics dialog did not appear within timeout.');
      }

      // Format stats information
      const cleanInfo = colorConverter.stripSampColors(dialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      // Extract player ID from first line of dialog body
      const firstLine = cleanInfo.split('\n')[0];
      const idMatch = firstLine.match(/\((\d+)\)$/);
      const dialogPlayerId = idMatch ? parseInt(idMatch[1]) : null;
      
      // Verify player ID
      if (dialogPlayerId === null) {
        console.warn(`[stats] Could not extract ID from: "${firstLine}"`);
      }
      
      if (dialogPlayerId !== playerId) {
        return await interaction.editReply(`❌ Player ID ${playerId} is not online or doesn't exist.`);
      }

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📊 Player Statistics: ID ${playerId}`)
        .setDescription(`\`\`\`\n${cleanInfo}\n\`\`\``)
        .setColor(0x3498DB)
        .setFooter({ text: 'Player Statistics' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[stats] Error:', err);
      await interaction.editReply('❌ Failed to retrieve player statistics.');
    }
  }
};