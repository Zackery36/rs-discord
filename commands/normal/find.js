const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');

// Textdraw IDs and texts
const NO_PLAYER_TEXTDRAW_ID = 2051;
const NO_PLAYER_TEXT = "~g~No players found";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('find')
    .setDescription('Find a player')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('Player name to find')
        .setRequired(true)),

  async execute(interaction, config) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const playerName = interaction.options.getString('name');
    const client = interaction.client;

    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
      
      // Send find command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent(`/find ${playerName}`)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Create a combined promise for dialog or textdraw
      const result = await new Promise((resolve) => {
        let dialogFound = false;
        let textdrawFound = false;
        
        // Dialog handler
        const dialogHandler = (dlg) => {
          if (dlg.title.toLowerCase().includes('find player')) {
            cleanup();
            resolve({ type: 'dialog', data: dlg });
          }
        };
        
        // Textdraw handler
        const textdrawHandler = (td) => {
          if (td.textdrawId === NO_PLAYER_TEXTDRAW_ID && 
              td.text.includes(NO_PLAYER_TEXT)) {
            cleanup();
            resolve({ type: 'textdraw', data: td });
          }
        };
        
        // Cleanup function
        const cleanup = () => {
          client.off('dialog', dialogHandler);
          client.off('textdraw', textdrawHandler);
          clearTimeout(timeout);
        };
        
        // Set timeout
        const timeout = setTimeout(() => {
          cleanup();
          resolve(null);
        }, 5000);
        
        // Add event listeners
        client.on('dialog', dialogHandler);
        client.on('textdraw', textdrawHandler);
      });

      if (!result) {
        return await interaction.editReply('❌ No response received within timeout.');
      }

      if (result.type === 'textdraw') {
        // Handle "No players found" textdraw
        return await interaction.editReply('❌ No players found matching that name.');
      }

      // Handle dialog response
      const dialog = result.data;
      
      // Format player information
      const cleanInfo = colorConverter.stripSampColors(dialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Player Found: ${playerName}`)
        .setDescription(`\`\`\`\n${cleanInfo}\n\`\`\``)
        .setColor(0x3498DB)
        .setFooter({ text: 'Player Location' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[find] Error:', err);
      await interaction.editReply('❌ Failed to find player. Please try again.');
    }
  }
};