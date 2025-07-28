const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('astats')
    .setDescription('Get account statistics')
    .addStringOption(opt =>
      opt.setName('account')
        .setDescription('Account name')
        .setRequired(true)),

  async execute(interaction, config) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const accountName = interaction.options.getString('account');
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
      
      // Send astats command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent(`/astats ${accountName}`)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for account stats dialog
      const dialog = await waitForDialog(
        d => d.title.toLowerCase().includes('account statistics'),
        5000
      );

      if (!dialog) {
        return await interaction.editReply('❌ Account statistics dialog did not appear within timeout.');
      }

      // Format stats information
      const cleanInfo = colorConverter.stripSampColors(dialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📊 Account Statistics: ${accountName}`)
        .setDescription(`\`\`\`\n${cleanInfo}\n\`\`\``)
        .setColor(0x3498DB)
        .setFooter({ text: 'Account Statistics' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[astats] Error:', err);
      await interaction.editReply('❌ Failed to retrieve account statistics.');
    }
  }
};