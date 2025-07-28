const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('groups')
    .setDescription('List all online groups'),
  
  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
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
      
      // 1) Send /groups command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/groups')}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 2) Wait for Online Groups dialog
      const dialog = await waitForDialog(
        d => d.title.toLowerCase().includes('online groups'),
        8000
      );
      
      if (!dialog) {
        return await interaction.editReply('❌ "Online Groups" dialog did not arrive within timeout.');
      }

      // 3) Format the groups list (remove colors, brackets, and hex codes)
      const cleanTitle = colorConverter.stripSampColors(dialog.title)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      const groupsList = colorConverter.stripSampColors(dialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => {
          const [id, name, members] = line.split('\t');
          return `#${id.padStart(3)} ${name} (${members} members)`;
        })
        .join('\n');
      
      // 4) Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📋 ${cleanTitle}`)
        .setDescription(`\`\`\`\n${groupsList}\n\`\`\``)
        .setColor(0x3498DB)
        .setFooter({ text: 'Online Groups' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[groups] Error:', err.message);
      await interaction.editReply('❌ Failed to fetch online groups.');
    }
  }
};