const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const DialogPaginator = require('../../utils/DialogPaginator');
const InputSanitizer = require('../../utils/inputSanitizer');

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
    const isEphemeral = !config.showPublicResponses;
    const alreadyHandled = interaction.deferred || interaction.replied;
    
    if (!alreadyHandled) {
      await interaction.deferReply({ ephemeral: isEphemeral });
    }

    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const newRank = interaction.options.getString('rank');
    const groupName = config.defaultGroup || 'Your Group';
    
    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
      const paginator = new DialogPaginator(client, config);
      
      // Send GRANK command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/grank')}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Search for player
      const playerResult = await paginator.searchPlayerInGroup(playerName, groupName);
      
      // Send player selection
      const playerCmd = `sendDialogResponse|${playerResult.dialog.dialogId}|1|${playerResult.index}|${playerResult.playerEntry}`;
      const safePlayerCmd = InputSanitizer.safeStringForRakSAMP(playerCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safePlayerCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for rank list dialog
      const rankDialog = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        const handler = dlg => {
          if (dlg.title.toLowerCase().includes('group rank')) {
            clearTimeout(timer);
            client.off('dialog', handler);
            resolve(dlg);
          }
        };
        client.on('dialog', handler);
      });
      
      if (!rankDialog) throw new Error('Group rank list dialog did not appear');

      // Parse rank list
      const cleanRankInfo = rankDialog.info.replace(/[{}]/g, '').replace(/<[A-F0-9]{6}>/gi, '');
      const rankLines = cleanRankInfo.split('\n').map(l => l.trim()).filter(Boolean);
      
      let rankIndex = -1;
      let rankNameFound = null;
      
      for (let i = 0; i < rankLines.length; i++) {
        const line = rankLines[i];
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
          const rankName = match[2].trim();
          if (rankName.toLowerCase().includes(newRank.toLowerCase())) {
            rankIndex = i;
            rankNameFound = rankName;
            break;
          }
        }
      }
      
      if (rankIndex === -1) throw new Error(`Rank "${newRank}" not found`);

      // Send rank selection
      const rankCmd = `sendDialogResponse|${rankDialog.dialogId}|1|${rankIndex}|${rankNameFound}`;
      const safeRankCmd = InputSanitizer.safeStringForRakSAMP(rankCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safeRankCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const successMsg = `✅ Rank updated: Set "${playerResult.playerNameFound}" to "${rankNameFound}" in ${groupName}`;
      
      if (alreadyHandled) {
        await interaction.followUp({ content: successMsg, ephemeral: isEphemeral });
      } else {
        await interaction.editReply(successMsg);
      }

    } catch (err) {
      let errorMsg = '❌ Failed to set group rank.';
      if (err.message.includes('Player not found')) {
        errorMsg = `❌ Player "${playerName}" not found in ${groupName}`;
      }
      else if (err.message.includes('Rank not found')) {
        errorMsg = `❌ Rank "${newRank}" not found in ${groupName}`;
      }
      
      if (alreadyHandled) {
        await interaction.followUp({ content: errorMsg, ephemeral: true });
      } else {
        await interaction.editReply(errorMsg);
      }
    }
  }
};