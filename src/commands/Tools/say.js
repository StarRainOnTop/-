const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('讓機器人發送普通訊息或 Embed 卡片')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送訊息的頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('輸入你想發送的內容')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('（可選）Embed 卡片標題，填了就會變成卡片')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image')
                .setDescription('（可選）Banner 圖片網址')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('（可選）邊條顏色，預設紫色 (#800080)')
                .setRequired(false)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');
        const messageText = interaction.options.getString('message').replace(/\\n/g, '\n');
        const titleText = interaction.options.getString('title');
        const imageUrl = interaction.options.getString('image');
        const colorInput = interaction.options.getString('color') || '#800080';

        try {
            // 只要填了 title、image 或 color，就會自動變成漂亮的 Embed 卡片
            if (titleText || imageUrl || interaction.options.getString('color')) {
                const embed = new EmbedBuilder()
                    .setDescription(messageText)
                    .setColor(colorInput);

                if (titleText) embed.setTitle(titleText);
                if (imageUrl) embed.setImage(imageUrl);

                await targetChannel.send({ embeds: [embed] });
            } else {
                await targetChannel.send(messageText);
            }

            await interaction.reply({ 
                content: `✅ 已成功發送至 ${targetChannel}！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ 發送失敗，請確認機器人權限！', 
                ephemeral: true 
            });
        }
    },
};
