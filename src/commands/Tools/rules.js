const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('發送伺服器規則')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送規則的頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');

        const rulesEmbed = new EmbedBuilder()
            .setColor(0x800080)
            .setTitle('🔮 伺服器規則 / SERVER RULES')
            .setDescription('規則測試成功！稍後可替換為完整文字。');

        try {
            await targetChannel.send({ embeds: [rulesEmbed] });
            await interaction.reply({ content: '✅ 已發送！', ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ 發送失敗。', ephemeral: true });
        }
    },
};
