const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const DialogPaginator = require('../../utils/DialogPaginator');
const InputSanitizer = require('../../utils/inputSanitizer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gkick')
    .setDescription('Kick a player from your group (Admin only)')
    .addStringOption(opt =>
      opt.setName('player')
        .setDescription('Player name to kick')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for kicking')
        .setRequired(true)),

  async execute(interaction, config) {
    await interaction.deferReply({ ephemeral: true });
    
    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const reason = interaction.options.getString('reason');
    const groupName = config.groupName || 'Your Group';
    
    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
      const paginator = new DialogPaginator(client, config);
      
      // Search for player using GKICK command
      const playerResult = await paginator.searchPlayerInGroup(playerName, groupName, '/gkick');
      
      // Send player selection
      const playerCmd = `sendDialogResponse|${playerResult.dialog.dialogId}|1|${playerResult.index}|${playerResult.playerEntry}`;
      const safePlayerCmd = InputSanitizer.safeStringForRakSAMP(playerCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safePlayerCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for kick dialog
      const kickDialog = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        const handler = dlg => {
          if (dlg.title.toLowerCase().includes('group kick')) {
            clearTimeout(timer);
            client.off('dialog', handler);
            resolve(dlg);
          }
        };
        client.on('dialog', handler);
      });
      
      if (!kickDialog) throw new Error('Group kick dialog did not appear');

      // Send kick reason
      const kickCmd = `sendDialogResponse|${kickDialog.dialogId}|1|-1|${reason}`;
      const safeKickCmd = InputSanitizer.safeStringForRakSAMP(kickCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safeKickCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      await interaction.editReply(`✅ Player "${playerResult.playerNameFound}" kicked from ${groupName} for: ${reason}`);

    } catch (err) {
      let errorMsg = '❌ Failed to kick player.';
      if (err.message.includes('Player not found')) {
        errorMsg = `❌ Player "${playerName}" not found in ${groupName}`;
      }
      await interaction.editReply(errorMsg);
    }
  }
};