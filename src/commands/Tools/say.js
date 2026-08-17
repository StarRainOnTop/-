
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('让机器人向指定频道发送消息')
        // 建议限制权限：仅允许有“管理消息”权限的人使用，防止普通成员滥用机器人发违规内容
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('选择要发送消息的频道')
                .addChannelTypes(ChannelType.GuildText) // 仅限文本频道
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('输入你想让机器人发送的内容')
                .setRequired(true)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');
        const messageText = interaction.options.getString('message');

        try {
            // 1. 在目标频道发送消息
            await targetChannel.send(messageText);

            // 2. 给指令调用者一个隐式回复（Ephemeral），只有他自己能看到，避免占用聊天版面
            await interaction.reply({ 
                content: `✅ 消息已成功发送至 ${targetChannel}！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ 发送失败，请检查机器人是否拥有在该频道发送消息的权限。', 
                ephemeral: true 
            });
        }
    },
};
