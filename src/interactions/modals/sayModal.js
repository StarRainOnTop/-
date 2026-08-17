const { EmbedBuilder } = require('discord.js');

module.exports = {
    customId: 'say_modal',
    async execute(interaction) {
        // 從 customId 取得目標頻道 ID
        const channelId = interaction.customId.replace('say_modal_', '');
        const targetChannel = await interaction.guild.channels.fetch(channelId);

        const title = interaction.fields.getTextInputValue('embed_title');
        const content = interaction.fields.getTextInputValue('embed_content');

        const embed = new EmbedBuilder()
            .setDescription(content)
            .setColor(0x800080); // 紫色邊條

        if (title) embed.setTitle(title);

        try {
            await targetChannel.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ 已成功將 Embed 卡片發送至 ${targetChannel}！`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ 發送失敗，請確認機器人在該頻道擁有發送訊息的權限！', ephemeral: true });
        }
    }
};
