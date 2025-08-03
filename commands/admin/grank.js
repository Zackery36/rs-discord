const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('grank')
    .setDescription('Set a player\'s group rank (Admin only)')
    .addStringOption(opt =>
      opt.setName('player')
         .setDescription('Player name')
         .setRequired(true))
    .addStringOption(opt =>
      opt.setName('rank')
         .setDescription('New rank name')
         .setRequired(true)),
  
  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }
    
    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const newRank = interaction.options.getString('rank');
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
      
      // 1) Send /grank command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/grank')}`,
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
          // Extract the player name and full prefix
          const match = line.match(/^(\d+)\s+([^\s]+)/);
          
          if (match) {
            const name = match[2].trim();
            
            if (name.toLowerCase().includes(playerName.toLowerCase())) {
              playerIndex = i;
              playerNameFound = name;
              
              // Get the full line prefix (e.g., "3 DR.Roman")
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
      
      if (!safePlayerCmd) {
        return await interaction.editReply('❌ Player selection command failed sanitization.');
      }
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safePlayerCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 4) Wait for rank list dialog
      const rankDialog = await waitForDialog(
        d => d.title.toLowerCase().includes('group rank'),
        5000
      );
      
      if (!rankDialog) {
        return await interaction.editReply('❌ Group rank list dialog did not appear.');
      }

      // 5) Parse rank list
      const cleanRankInfo = colorConverter.stripSampColors(rankDialog.info)
        .replace(/[{}]/g, '')
        .replace(/<[A-F0-9]{6}>/gi, '');
      
      const rankLines = cleanRankInfo
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      
      // Find matching rank
      let rankIndex = -1;
      let rankEntry = null;
      let rankNameFound = null;
      
      for (let i = 0; i < rankLines.length; i++) {
        const line = rankLines[i];
        // Extract rank ID and name
        const match = line.match(/^(\d+)\s+(.+)$/);
        
        if (match) {
          const rankName = match[2].trim();
          
          if (rankName.toLowerCase().includes(newRank.toLowerCase())) {
            rankIndex = i;
            rankNameFound = rankName;
            rankEntry = line;
            break;
          }
        }
      }
      
      if (rankIndex === -1) {
        return await interaction.editReply(`❌ Rank "${newRank}" not found in group ranks.`);
      }

      // 6) Send rank selection
      const rankCmd = `sendDialogResponse|${rankDialog.dialogId}|1|${rankIndex}|${rankEntry}`;
      const safeRankCmd = InputSanitizer.safeStringForRakSAMP(rankCmd);
      
      if (!safeRankCmd) {
        return await interaction.editReply('❌ Rank selection command failed sanitization.');
      }
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safeRankCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      await interaction.editReply(`✅ Rank updated: Set "${playerNameFound}" to "${rankNameFound}" in ${groupName}`);

    } catch (err) {
      console.error('[grank] Error:', err);
      await interaction.editReply('❌ Failed to set group rank. Check logs for details.');
    }
  }
};