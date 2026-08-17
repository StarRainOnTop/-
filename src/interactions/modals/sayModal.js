import { EmbedBuilder } from 'discord.js';

export const customId = 'say_modal';
export const name = 'sayModal';

export async function execute(interaction) {
    const channelId = interaction.customId.replace('say_modal_', '');
    const targetChannel = await interaction.guild.channels.fetch(channelId);

    const title = interaction.fields.getTextInputValue('embed_title');
    const content = interaction.fields.getTextInputValue('embed_content');

    const embed = new EmbedBuilder()
        .setDescription(content)
        .setColor(0x800080);

    if (title) embed.setTitle(title);

    try {
        await targetChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ 已成功將 Embed 卡片發送至 ${targetChannel}！`, ephemeral: true });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ 發送失敗，請確認機器人在該頻道擁有發送訊息的權限！', ephemeral: true });
    }
}

export default {
    customId,
    name,
    execute
};
