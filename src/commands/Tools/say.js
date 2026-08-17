const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('開啟多行視窗輸入文字並發送 Embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送訊息的頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');

        // 建立彈出視窗 (Modal)
        const modal = new ModalBuilder()
            .setCustomId(`say_modal_${targetChannel.id}`)
            .setTitle('發送 Embed 卡片訊息');

        const titleInput = new TextInputBuilder()
            .setCustomId('embed_title')
            .setLabel('卡片標題 (可不填)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const contentInput = new TextInputBuilder()
            .setCustomId('embed_content')
            .setLabel('訊息內容 (可直接按 Enter 換行/留空行)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('在此貼上或輸入規則內容...')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput)
        );

        await interaction.showModal(modal);
    },
};
