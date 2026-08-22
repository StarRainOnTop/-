import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                '✅「加入即創建」系統設定完成',
                `已建立觸發頻道：${triggerChannel}\n\n` +
                `**目前設定：**\n` +
                `• 臨時頻道名稱範本：\`${nameTemplate}\`\n` +
                `• 人數上限：${userLimit === 0 ? '無限制' : userLimit + ' 人'}\n` +
                `• 位元率：${bitrate} kbps\n` +
                `${category ? `• 分類：${category.name}` : '• 分類：無（根目錄）'}\n\n` +
                `當使用者加入此頻道時，系統將會為其建立一個專屬的臨時語音頻道。`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error in JoinToCreate setup:', error);
            throw new TitanBotError(
                `Setup failed: ${error.message}`,
                ErrorTypes.DISCORD_API,
                '無法設定「加入即創建」系統。'
            );
        }
    }
};
