const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admins')
    .setDescription('List online admins'),

  async execute(interaction, config) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

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
      
      // Send admins command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/admins')}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for online admins dialog
      const dialog = await waitForDialog(
        d => d.title.toLowerCase().includes('online admins'),
        5000
      );

      if (!dialog) {
        return await interaction.editReply('❌ Online admins dialog did not appear within timeout.');
      }

      // Format admin information
      const cleanInfo = colorConverter.stripSampColors(dialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle('👑 Online Administrators')
        .setDescription(`\`\`\`\n${cleanInfo}\n\`\`\``)
        .setColor(0xF1C40F)
        .setFooter({ text: 'Server Admins' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[admins] Error:', err);
      await interaction.editReply('❌ Failed to retrieve online admins.');
    }
  }
};