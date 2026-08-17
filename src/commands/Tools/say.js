const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('讓機器人向指定頻道發送訊息')
        // 限制權限：僅允許有「管理訊息」權限的人使用，防止普通成員濫用機器人發違規內容
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送訊息的頻道')
                .addChannelTypes(ChannelType.GuildText) // 僅限文字頻道
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('輸入你想讓機器人發送的內容')
                .setRequired(true)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');
        const messageText = interaction.options.getString('message');

        try {
            // 1. 在目標頻道發送訊息
            await targetChannel.send(messageText);

            // 2. 給指令調用者一個隱藏回覆（Ephemeral），只有他自己能看到，避免佔用聊天版面
            await interaction.reply({ 
                content: `✅ 訊息已成功發送至 ${targetChannel}！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ 發送失敗，請檢查機器人是否擁有在該頻道發送訊息的權限。', 
                ephemeral: true 
            });
        }
    },
};
