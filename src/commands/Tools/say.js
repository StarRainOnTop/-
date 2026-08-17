import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('讓機器人替你發送訊息')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('你想發送的文字內容')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('指定發送的目標頻道（選填，預設為當前頻道）')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    // 檢查機器人在目標頻道是否有發送訊息的權限
    if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        content: `❌ 我沒有權限在 ${targetChannel} 發送訊息！`,
        ephemeral: true
      });
    }

    try {
      // 在指定頻道發送訊息
      await targetChannel.send({ content: message });

      // 給發送者隱藏回覆
      await interaction.reply({ 
        content: `✅ 訊息已成功發送到 ${targetChannel}！`, 
        ephemeral: true 
      });
    } catch (error) {
      console.error('執行 /say 時發生錯誤:', error);
      await interaction.reply({
        content: '❌ 發送訊息時發生錯誤，請稍後再試。',
        ephemeral: true
      });
    }
  },
};
