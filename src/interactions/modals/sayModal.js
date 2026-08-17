import { EmbedBuilder } from 'discord.js';

export const customId = 'say_modal';
export const name = 'sayModal';

export async function execute(interaction) {
    // 取得目標頻道 ID
    const channelId = interaction.customId.replace('say_modal_', '');
    const targetChannel = await interaction.guild.channels.fetch(channelId);

    const title = interaction.fields.getTextInputValue('embed_title');
    const content = interaction.fields.getTextInputValue('embed_content');

    // 建立 Embed 卡片物件
    const embed = new EmbedBuilder()
        .setDescription(content)
        .setColor(0x800080); // 紫色邊條

    if (title && title.trim().length > 0) {
        embed.setTitle(title);
    }

    try {
        // 確保以 embeds 陣列發送
        await targetChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ 已成功將 Embed 卡片發送至 ${targetChannel}！`, ephemeral: true });
    } catch (error) {
        console.error('發送 Embed 失敗:', error);
        await interaction.reply({ content: '❌ 發送失敗，請確認機器人在該頻道擁有發送訊息的權限！', ephemeral: true });
    }
}

export default {
    customId,
    name,
    execute
};
