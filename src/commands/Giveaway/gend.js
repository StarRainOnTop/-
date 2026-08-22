import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "立即結束進行中的抽獎活動並挑選得獎者。",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("要結束的抽獎訊息 ID。")
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
                "你需要「管理伺服器」權限才能結束抽獎活動。",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

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
                "在資料庫中找不到具有該訊息 ID 的抽獎活動。",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const updatedGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            updatedGiveaway.channelId,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                `Channel not found: ${updatedGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "找不到舉辦抽獎活動的頻道。抽獎狀態已更新。",
                { channelId: updatedGiveaway.channelId, messageId }
            );
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {
            throw new TitanBotError(
                `Message not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "找不到抽獎訊息。抽獎狀態已更新。",
                { messageId, channelId: updatedGiveaway.channelId }
            );
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🎉 **抽獎已結束** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");
            const winnerPingMsg = await channel.send({
                content: `🎉 恭喜 ${winnerMentions}！你們贏得了 **${updatedGiveaway.prize}** 的抽獎！請聯絡主辦人 <@${updatedGiveaway.hostId}> 來領取您的獎品。`,
            });
            updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

            logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `抽獎已結束，共選出 ${winners.length} 位得獎者`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '獎品',
                                value: updatedGiveaway.prize || '神秘獎品！',
                                inline: true
                            },
                            {
                                name: '得獎者',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: '參與人數',
                                value: endResult.participantCount.toString(),
                                inline: true
                            }
                      ]
                  }
              });
          } catch (logError) {
              logger.debug('Error logging giveaway winner event:', logError);
          }
        } else {
            await channel.send({
                content: `**${updatedGiveaway.prize}** 的抽獎活動已結束，沒有有效的參與者。`,
            });
            logger.info(`Giveaway ended with no winners: ${messageId}`);
        }

        logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "抽獎已結束 ✅",
                    `已成功結束位於 ${channel} 的 **${updatedGiveaway.prize}** 抽獎活動。從 ${endResult.participantCount} 位參與者中選出了 ${winners.length} 位得獎者。`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
