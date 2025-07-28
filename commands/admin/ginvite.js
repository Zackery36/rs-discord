const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ginvite')
    .setDescription('Invite a player to your group (Admin only)')
    .addIntegerOption(opt =>
      opt.setName('id')
        .setDescription('Player ID to invite')
        .setRequired(true)),

  async execute(interaction, config) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }

    const playerId = interaction.options.getInteger('id');
    
    try {
      await axios.post(
        `http://${config.raksampHost}:${config.raksampPort}/`,
        `command=${encodeURIComponent(`/ginvite ${playerId}`)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      
      await interaction.editReply(`✅ Invite sent to player ID ${playerId}`);
    } catch (err) {
      console.error('[ginvite] Error:', err);
      await interaction.editReply('❌ Failed to send group invite.');
    }
  }
};