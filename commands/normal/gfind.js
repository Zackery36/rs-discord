const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gfind')
    .setDescription('Find and post group stats to Discord')
    .addStringOption(opt =>
      opt.setName('groupname')
         .setDescription('Name of the group')
         .setRequired(true)
    ),

  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply();
    }
    
    const client   = interaction.client;
    const rawName  = interaction.options.getString('groupname');
    const lcName   = rawName.toLowerCase();

    console.log(`[gfind] Started search for "${rawName}"`);

    // Utility to wait for an incoming dialog matching `filter` up to `timeout` ms
    function waitForDialog(filter, timeout) {
      return new Promise(resolve => {
        const handler = dlg => {
          const title = colorConverter.stripSampColors(dlg.title);
          if (filter({ ...dlg, title })) {
            cleanup();
            resolve({ ...dlg, title });
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

    // Helper function to make HTTP requests
    async function makeRequest(url, data) {
      return axios.post(url, data, {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Connection': 'close'
        },
        timeout: 10000,
      });
    }

    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;

      // 1) Send "/groups" command
      await makeRequest(baseUrl, `command=${encodeURIComponent('/groups')}`);

      // 2) Wait for the dialog
      const groups = await waitForDialog(
        d => d.title.toLowerCase().includes('online groups'),
        8000
      );
      
      if (!groups) {
        return await interaction.editReply('❌ "Online Groups" dialog did not arrive within timeout.');
      }

      // 3) Parse groups list
      const cleanInfo = colorConverter.stripSampColors(groups.info)
        .replace(/[{}]/g, '');
      
      const lines = cleanInfo
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
        
      const items = lines.map((line, idx) => {
        const parts = line.split('\t');
        if (parts.length < 2) return null;
        
        const [idStr, name] = parts;
        const id = parseInt(idStr, 10);
        
        if (isNaN(id)) return null;
        
        return {
          idx,
          id,
          name: name.toLowerCase().trim(),
          raw: line
        };
      }).filter(Boolean);

      // 4) Find the matching group
      const match = items.find(item => item.name.includes(lcName));
      if (!match) {
        return await interaction.editReply(`❌ Group "${rawName}" not found in ${items.length} online groups.`);
      }

      // 5) Send selection command
      const botcmd = `sendDialogResponse|${groups.dialogId}|1|${match.idx}|${match.id}`;
      await makeRequest(baseUrl, `botcommand=${encodeURIComponent(botcmd)}`);

      // 6) Wait for Group Stats dialog
      const stats = await waitForDialog(
        d => d.title.toLowerCase().includes('group stats'),
        8000
      );
      
      if (!stats) {
        return await interaction.editReply('❌ "Group Stats" dialog did not arrive within timeout.');
      }

      // 7) Format stats (remove colors and brackets)
      const cleanTitle = colorConverter.stripSampColors(stats.title)
        .replace(/[{}]/g, '');
      
      let cleanStats = colorConverter.stripSampColors(stats.info)
        .replace(/[{}]/g, '');
      
      // 8) Replace zones list with count
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
      
      // 9) Create embed
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${cleanTitle} - ${rawName}`)
        .setDescription(`\`\`\`\n${cleanStats}\n\`\`\``)
        .setColor(0x9B59B6)
        .setFooter({ text: 'Group Statistics' });
      
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[gfind] Error:', err.message);
      let errorMessage = '❌ An error occurred while fetching group stats.';
      
      if (err.code === 'ECONNRESET') {
        errorMessage = '❌ Connection was reset by RakSAMP. Server might have crashed.';
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = '❌ Could not connect to RakSAMP. Is the HTTP listener running?';
      } else if (err.code === 'ETIMEDOUT') {
        errorMessage = '❌ Request timed out. RakSAMP might be unresponsive.';
      }
      
      await interaction.editReply(errorMessage);
    }
  }
};