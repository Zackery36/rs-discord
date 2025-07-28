const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { InteractionResponseType } = require('discord.js'); // Correct import
const InputSanitizer = require('../utils/inputSanitizer');

module.exports = (client, config) => {
  // Store dialog state for group finding
  client.dialogState = new Map();
  
  // load commands into client.commands
  ['normal','admin'].forEach(folder => {
    const dir = path.join(__dirname,'../commands',folder);
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))) {
      const cmd = require(path.join(dir,file));
      cmd.adminOnly = (folder==='admin');
      client.commands.set(cmd.data.name, cmd);
      console.log(`Loaded ${folder} command: ${cmd.data.name}`);
    }
  });
  
  // handle slash-command interactions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    
    // admin check
    if (cmd.adminOnly) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      // Ensure adminRoleIds is defined and is an array
      const adminRoleIds = config.adminRoleIds || [];
      
      if (!adminRoleIds.length || 
          !member.roles.cache.some(r => adminRoleIds.includes(r.id))) {
        return interaction.reply({ 
          content: '🚫 You lack permission.', 
          ephemeral: true 
        });
      }
    }
    
    try {
      // Defer only if not already deferred
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          ephemeral: cmd.adminOnly // Use ephemeral directly
        });
      }
      
      await cmd.execute(interaction, config);
    } catch (err) {
      console.error('Command execution error:', err);
      if (!interaction.replied && !interaction.deferred) {
        interaction.reply({ 
          content: '❌ Command failed.', 
          ephemeral: true 
        });
      } else {
        interaction.editReply('❌ Command failed.');
      }
    }
  });
  
  // Load and register messageCreate event handler
  const messageCreateHandler = require('../events/messageCreate')(config);
  client.on('messageCreate', messageCreateHandler);
};