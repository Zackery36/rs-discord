const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gstats')
    .setDescription('Get statistics for a group')
    .addIntegerOption(opt =>
      opt.setName('id')
         .setDescription('Group ID')
         .setRequired(true)),
  
  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply();
    }
    
    const client = interaction.client;
    const groupId = interaction.options.getInteger('id');
    
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
      
      // 1) Send /gstats command
      const cmd = `/gstats ${groupId}`;
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent(cmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 2) Wait for Group Stats dialog
      const stats = await waitForDialog(
        d => d.title.toLowerCase().includes('group stats'),
        8000
      );
      
      if (!stats) {
        return await interaction.editReply('❌ "Group Stats" dialog did not arrive within timeout.');
      }

      // 3) Format stats (remove colors and brackets)
      const cleanTitle = colorConverter.stripSampColors(stats.title)
        .replace(/[{}]/g, '');
      
      let cleanStats = colorConverter.stripSampColors(stats.info)
        .replace(/[{}]/g, '');
      
      // 4) Replace zones list with count
      const statsLines = cleanStats.split('\n');
      let newStatsLines = [];
      let zonesCount = 0;
      let foundZonesSection = false;
      let replacedZones = false;

      for (let i = 0; i < statsLines.length; i++) {
          const line = statsLines[i];
          
          if (line.toLowerCase().startsWith('zones:')) {
              foundZonesSection = true;
              // Keep the "Zones:" header but don't add it yet
              continue;
          }
          
          if (foundZonesSection && !replacedZones) {
              if (/^\d+\.\s*#\s*\d+$/.test(line.trim())) {
                  zonesCount++;
              } else {
                  // End of zones list - add the count
                  newStatsLines.push(`Zones: ${zonesCount}/25`);
                  replacedZones = true;
                  // Add the current non-zone line
                  newStatsLines.push(line);
              }
          } else {
              newStatsLines.push(line);
          }
      }

      // If we found zones but didn't add count (no non-zone line after)
      if (foundZonesSection && !replacedZones) {
          newStatsLines.push(`Zones: ${zonesCount}/25`);
      }

      cleanStats = newStatsLines.join('\n');
      
      // 5) Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${cleanTitle} (#${groupId})`)
        .setDescription(`\`\`\`\n${cleanStats}\n\`\`\``)
        .setColor(0x2ECC71)
        .setFooter({ text: 'Group Statistics' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[gstats] Error:', err.message);
      await interaction.editReply('❌ Failed to fetch group stats.');
    }
  }
};