const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('讓機器人向指定頻道發送 Embed 訊息或普通文字')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送訊息的頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('輸入你想發送的內容（支援多行文字）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('（可選）Embed 卡片的標題')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image')
                .setDescription('（可選）Embed 圖片網址 (URL)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('（可選）卡片邊條顏色 (例如: #800080 或 Purple)')
                .setRequired(false)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');
        const messageText = interaction.options.getString('message').replace(/\\n/g, '\n');
        const titleText = interaction.options.getString('title');
        const imageUrl = interaction.options.getString('image');
        const colorInput = interaction.options.getString('color') || '#800080';

        try {
            // 如果填寫了標題或圖片，則以 Embed（卡片）形式發送
            if (titleText || imageUrl) {
                const embed = new EmbedBuilder()
                    .setDescription(messageText)
                    .setColor(colorInput);

                if (titleText) embed.setTitle(titleText);
                if (imageUrl) embed.setImage(imageUrl);

                await targetChannel.send({ embeds: [embed] });
            } else {
                // 如果沒填標題和圖片，就發送普通 Markdown 訊息
                await targetChannel.send(messageText);
            }

            await interaction.reply({ 
                content: `✅ 訊息已成功發送至 ${targetChannel}！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ 發送失敗，請檢查機器人權限或圖片網址格式是否正確。', 
                ephemeral: true 
            });
        }
    },
};
