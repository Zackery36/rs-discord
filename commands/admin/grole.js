const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');
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
    await interaction.deferReply({ ephemeral: isEphemeral });
    
    const client = interaction.client;
    const playerName = interaction.options.getString('player');
    const newRole = interaction.options.getString('role');
    const groupName = config.defaultGroup || 'Your Group';
    const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
    
    try {
      // Helper: Wait for specific dialog
      const waitForDialog = (filter, timeout) => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), timeout);
          const handler = dlg => {
            if (filter(dlg)) {
              clearTimeout(timer);
              client.off('dialog', handler);
              resolve(dlg);
            }
          };
          client.on('dialog', handler);
        });
      };

      // Helper: Find player in dialog content
      const findPlayerInDialog = (dialog, targetName) => {
        const cleanInfo = colorConverter.stripSampColors(dialog.info)
          .replace(/[{}]/g, '')
          .replace(/<[A-F0-9]{6}>/gi, '');
          
        const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
        const hasNext = dialog.buttons?.[0]?.toLowerCase() === 'next';
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const columns = line.split(/\t|\s{2,}/).filter(col => col.trim());
          
          if (columns.length >= 5) {
            const nameParts = [];
            let j = 1;
            
            // Extract player name from columns
            while (j < columns.length - 3 && 
                  !['Leader', 'Co-Leader', 'Member'].includes(columns[j]) &&
                  !columns[j].match(/\d{1,2}\s\w+$/)) {
              nameParts.push(columns[j]);
              j++;
            }
            
            const name = nameParts.join(' ');
            if (name.toLowerCase().includes(targetName.toLowerCase())) {
              return {
                found: true,
                index: i,
                playerNameFound: name,
                playerEntry: line,
                hasNext
              };
            }
          }
        }
        
        return { found: false, hasNext };
      };

      // Helper: Search player through dialog pages
      const searchPlayerInDialogPages = async (initialDialog, targetName, groupName) => {
        let currentDialog = initialDialog;
        let page = 0;
        const maxPages = 10;

        while (page < maxPages) {
          const result = findPlayerInDialog(currentDialog, targetName);
          if (result.found) return result;
          if (!result.hasNext) break;
          
          // Go to next page
          const nextCmd = `sendDialogResponse|${currentDialog.dialogId}|0|0|Next`;
          await axios.post(
            baseUrl,
            `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(nextCmd))}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );
          
          // Wait for next page dialog
          currentDialog = await waitForDialog(
            dlg => dlg.title.toLowerCase().includes(groupName.toLowerCase()),
            3000
          );
          
          if (!currentDialog) break;
          page++;
        }
        
        throw new Error('Player not found in group member list');
      };

      // Helper: Select dialog option
      const selectDialogOption = async (dialogId, index, value) => {
        const cmd = `sendDialogResponse|${dialogId}|1|${index}|${value}`;
        await axios.post(
          baseUrl,
          `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(cmd))}`,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
      };

      // Helper: Find role in dialog
      const findRoleInDialog = (dialog, targetRole) => {
        const cleanInfo = colorConverter.stripSampColors(dialog.info)
          .replace(/[{}]/g, '')
          .replace(/<[A-F0-9]{6}>/gi, '');
          
        const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
        
        for (let i = 0; i < lines.length; i++) {
          const roleName = lines[i].trim();
          if (roleName.toLowerCase().includes(targetRole.toLowerCase())) {
            return i;
          }
        }
        
        return -1;
      };

      // --- MAIN COMMAND LOGIC STARTS HERE ---
      
      // Send GROLE command
      await axios.post(
        baseUrl,
        `command=${encodeURIComponent('/grole')}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Wait for group member list dialog
      const memberDialog = await waitForDialog(
        dlg => dlg.title.toLowerCase().includes(groupName.toLowerCase()),
        5000
      );
      
      if (!memberDialog) throw new Error('Group member list dialog not received');
      
      // Search for player through pages
      const playerResult = await searchPlayerInDialogPages(
        memberDialog, playerName, groupName
      );
      
      // Select player
      await selectDialogOption(
        memberDialog.dialogId, playerResult.index, playerResult.playerEntry
      );

      // Wait for role list dialog
      const roleDialog = await waitForDialog(
        dlg => dlg.title.toLowerCase().includes('group role'),
        5000
      );
      
      if (!roleDialog) throw new Error('Group role list dialog did not appear');
      
      // Find role
      const roleIndex = findRoleInDialog(roleDialog, newRole);
      if (roleIndex === -1) throw new Error(`Role "${newRole}" not found`);
      
      // Select role
      await selectDialogOption(
        roleDialog.dialogId, roleIndex, newRole
      );

      await interaction.editReply(
        `✅ Role updated: Set "${playerResult.playerNameFound}" to "${newRole}" in ${groupName}`
      );

    } catch (err) {
      let errorMsg = '❌ Failed to set group role.';
      if (err.message.includes('Player not found')) {
        errorMsg = `❌ Player "${playerName}" not found in ${groupName}`;
      }
      else if (err.message.includes('Role not found')) {
        errorMsg = `❌ Role "${newRole}" not found in ${groupName}`;
      }
      
      await interaction.editReply(errorMsg);
    }
  }
};