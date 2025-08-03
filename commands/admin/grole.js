const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const DialogPaginator = require('../../utils/DialogPaginator');
const InputSanitizer = require('../../utils/inputSanitizer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('grole')
    .setDescription('Set a player\'s group role (Admin only)')
    .addStringOption(opt =>
      opt.setName('player')
        .setDescription('Player name')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('role')
        .setDescription('New role name')
        .setRequired(true)),
  
  async execute(interaction, config) {
    const isEphemeral = !config.showPublicResponses;
    
    // Create a safe deferral function
    const safeDefer = async () => {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: isEphemeral });
          return true;
        }
        return false;
      } catch (e) {
        if (e.code === 'InteractionAlreadyReplied') {
          return false;
        }
        throw e;
      }
    };

    const wasDeferred = await safeDefer();
    
    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const newRole = interaction.options.getString('role');
    const groupName = config.defaultGroup || 'Your Group';
    
    try {
      const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
      const paginator = new DialogPaginator(client, config);
      
      // Send GROLE command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/grole')}`,
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

      // Wait for role list dialog
      const roleDialog = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        const handler = dlg => {
          if (dlg.title.toLowerCase().includes('group role')) {
            clearTimeout(timer);
            client.off('dialog', handler);
            resolve(dlg);
          }
        };
        client.on('dialog', handler);
      });
      
      if (!roleDialog) throw new Error('Group role list dialog did not appear');

      // Parse role list
      const cleanRoleInfo = roleDialog.info.replace(/[{}]/g, '').replace(/<[A-F0-9]{6}>/gi, '');
      const roleLines = cleanRoleInfo.split('\n').map(l => l.trim()).filter(Boolean);
      
      let roleIndex = -1;
      let roleNameFound = null;
      
      for (let i = 0; i < roleLines.length; i++) {
        const roleName = roleLines[i].trim();
        if (roleName.toLowerCase().includes(newRole.toLowerCase())) {
          roleIndex = i;
          roleNameFound = roleName;
          break;
        }
      }
      
      if (roleIndex === -1) throw new Error(`Role "${newRole}" not found`);

      // Send role selection
      const roleCmd = `sendDialogResponse|${roleDialog.dialogId}|1|${roleIndex}|${roleNameFound}`;
      const safeRoleCmd = InputSanitizer.safeStringForRakSAMP(roleCmd);
      
      await axios.post(
        baseUrl,
        `botcommand=${encodeURIComponent(safeRoleCmd)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const successMsg = `✅ Role updated: Set "${playerResult.playerNameFound}" to "${roleNameFound}" in ${groupName}`;
      
      if (interaction.replied) {
        await interaction.followUp({ content: successMsg, ephemeral: isEphemeral });
      } else {
        await interaction.editReply(successMsg);
      }

    } catch (err) {
      let errorMsg = '❌ Failed to set group role.';
      if (err.message.includes('Player not found')) {
        errorMsg = `❌ Player "${playerName}" not found in ${groupName}`;
      }
      else if (err.message.includes('Role not found')) {
        errorMsg = `❌ Role "${newRole}" not found in ${groupName}`;
      }
      
      // Handle errors based on current interaction state
      if (interaction.replied) {
        await interaction.followUp({ content: errorMsg, ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply(errorMsg);
      } else {
        await interaction.reply({ content: errorMsg, ephemeral: true });
      }
    }
  }
};