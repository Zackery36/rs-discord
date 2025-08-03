const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gkick')
    .setDescription('Kick a player from the group (Admin only)')
    .addStringOption(opt =>
      opt.setName('player')
        .setDescription('Player name to kick')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for kicking')
        .setRequired(true)),
  
  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }
    
    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const reason = interaction.options.getString('reason');
    const groupName = config.groupName || 'Your Group';
    
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
      
      // 1) Send /gkick command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/gkick')}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 2) Wait for group member list dialog
      let memberDialog = await waitForDialog(
        d => d.title.toLowerCase().includes(groupName.toLowerCase()),
        8000
      );
      
      if (!memberDialog) {
        return await interaction.editReply(`❌ ${groupName} member list dialog did not arrive within timeout.`);
      }

      // Player search with pagination
      let playerIndex = -1;
      let playerEntry = null;
      let playerNameFound = null;
      let currentPage = 0;
      const maxPages = 8;

      while (currentPage < maxPages) {
        // Parse current page
        const cleanMemberInfo = colorConverter.stripSampColors(memberDialog.info)
          .replace(/[{}]/g, '')
          .replace(/<[A-F0-9]{6}>/gi, '');
        
        const memberLines = cleanMemberInfo
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
        
        // Search for player in current page
        for (let i = 0; i < memberLines.length; i++) {
          const line = memberLines[i];
          // Extract the player name
          const match = line.match(/^(\d+)\s+([^\s]+)/);
          
          if (match) {
            const name = match[2].trim();
            
            if (name.toLowerCase().includes(playerName.toLowerCase())) {
              playerIndex = i;
              playerNameFound = name;
              
              // Get the full line prefix
              const prefix = line.substring(0, line.indexOf(name) + name.length).trim();
              playerEntry = prefix;
              break;
            }
          }
        }

        // Exit loop if player found
        if (playerIndex !== -1) break;

        // Go to next page
        const nextCmd = `sendDialogResponse|${memberDialog.dialogId}|0|0|Next`;
        const safeNextCmd = InputSanitizer.safeStringForRakSAMP(nextCmd);
        
        await axios.post(
          baseUrl,
          `botcommand=${encodeURIComponent(safeNextCmd)}`,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        // Wait for next page dialog
        memberDialog = await waitForDialog(
          d => d.title.toLowerCase().includes(groupName.toLowerCase()),
          3000
        );
        
        // If next page doesn't arrive, stop searching
        if (!memberDialog) break;
        
        currentPage++;
      }
      
      // Player not found after all pages
      if (playerIndex === -1) {
        return await interaction.editReply(`❌ Player "${playerName}" not found in ${groupName} after ${currentPage + 1} pages.`);
      }

      // 3) Send player selection
      const playerCmd = `sendDialogResponse|${memberDialog.dialogId}|1|${playerIndex}|${playerEntry}`;
      const safePlayerCmd = InputSanitizer.safeStringForRakSAMP(playerCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safePlayerCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 4) Wait for kick reason dialog
      const kickDialog = await waitForDialog(
        d => d.title.toLowerCase().includes('group kick'),
        5000
      );
      
      if (!kickDialog) {
        return await interaction.editReply('❌ Group kick dialog did not appear.');
      }

      // 5) Send kick reason
      const kickCmd = `sendDialogResponse|${kickDialog.dialogId}|1|-1|${reason}`;
      const safeKickCmd = InputSanitizer.safeStringForRakSAMP(kickCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safeKickCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      await interaction.editReply(`✅ Player "${playerNameFound}" kicked from ${groupName} for: ${reason}`);

    } catch (err) {
      console.error('[gkick] Error:', err);
      await interaction.editReply('❌ Failed to kick player. Check logs for details.');
    }
  }
};