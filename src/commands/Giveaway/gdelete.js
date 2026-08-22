import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "刪除抽獎訊息並將其從資料庫中移除。",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("要刪除的抽獎訊息 ID。")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                '此指令只能在伺服器中使用。',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "你需要「管理伺服器」權限才能刪除抽獎活動。",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                '請提供有效的訊息 ID。',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                '找不到具有該訊息 ID 的抽獎活動。',
                { messageId, guildId: interaction.guildId }
            );
        }

        let deletedMessage = false;
        let channelName = "未知頻道";

        const tryDeleteFromChannel = async (channel) => {
            if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                return false;
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return false;
            }

            await message.delete();
            channelName = channel.name || 'unknown-channel';
            deletedMessage = true;
            return true;
        };

        try {
            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
            if (await tryDeleteFromChannel(channel)) {
                logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
            }

            if (!deletedMessage && interaction.guild) {
                const textChannels = interaction.guild.channels.cache.filter(
                    ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                );

                for (const [, guildChannel] of textChannels) {
                    const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                    if (foundAndDeleted) {
                        logger.debug(`Deleted giveaway message ${messageId} via fallback lookup in #${channelName}`);
                        break;
                    }
                }
            }
        } catch (error) {
            logger.warn(`Could not delete giveaway message: ${error.message}`);
        }

        const removedFromDatabase = await deleteGiveaway(
            interaction.client,
            interaction.guildId,
            messageId,
        );

        if (!removedFromDatabase) {
            throw new TitanBotError(
                `Failed to delete giveaway from database: ${messageId}`,
                ErrorTypes.UNKNOWN,
                '無法從資料庫中移除此抽獎活動。請再試一次。',
                { messageId, guildId: interaction.guildId }
            );
        }

        const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
        const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

        if (stillExistsInDatabase) {
            throw new TitanBotError(
                `Giveaway still exists after deletion: ${messageId}`,
                ErrorTypes.UNKNOWN,
                '刪除後資料仍殘留在資料庫中。請再試一次。',
                { messageId, guildId: interaction.guildId }
            );
        }

        const statusMsg = deletedMessage
            ? `且訊息已從 #${channelName} 中刪除`
            : `但該訊息已被刪除，或無法存取該頻道。`;

        const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
        const hasWinners = winnerIds.length > 0;
        const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

        const winnerStatusMsg = hasWinners
            ? `此抽獎活動先前已選出 ${winnerIds.length} 位得獎者。`
            : wasEnded
              ? '此抽獎活動結束時沒有有效的得獎者。'
              : '刪除前未挑選任何得獎者。';

        logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                data: {
                    description: `已刪除抽獎活動：${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: '獎品',
                            value: giveaway.prize || '未知',
                            inline: true
                        },
                        {
                            name: '參與人數',
                            value: (giveaway.participants?.length || 0).toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway deletion:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "抽獎活動已刪除",
                    `成功刪除 **${giveaway.prize}** 的抽獎活動${statusMsg}。${winnerStatusMsg}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
