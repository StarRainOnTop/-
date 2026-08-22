import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("重新抽選已結束抽獎活動的得獎者。")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("已結束抽獎活動的訊息 ID。")
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
                "你需要「管理伺服器」權限才能重新抽選抽獎活動。",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                '請提供有效的訊息 ID。',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId,
        );

        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "在資料庫中找不到具有該訊息 ID 的抽獎活動。",
                { messageId, guildId: interaction.guildId }
            );
        }

        if (!giveaway.isEnded && !giveaway.ended) {
            throw new TitanBotError(
                `Giveaway still active: ${messageId}`,
                ErrorTypes.VALIDATION,
                "此抽獎活動仍在進行中。請先使用 `/gend` 來結束它。",
                { messageId, status: 'active' }
            );
        }

        const participants = giveaway.participants || [];

        if (participants.length < giveaway.winnerCount) {
            throw new TitanBotError(
                `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                ErrorTypes.VALIDATION,
                "參與人數不足，無法選出指定數量的得獎者。",
                { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
            );
        }

        const newWinners = selectWinners(
            participants,
            giveaway.winnerCount,
        );

        const updatedGiveaway = {
            ...giveaway,
            winnerIds: newWinners,
            rerolledAt: new Date().toISOString(),
            rerolledBy: interaction.user.id
        };

        const channel = await interaction.client.channels.fetch(
            giveaway.channelId,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            logger.warn(`Could not find channel for giveaway ${messageId}, but saved new winners to database`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "重新抽選完成",
                        "已選出新的得獎者並儲存至資料庫。但找不到頻道以發布公告。",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(",");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **抽獎重新抽選** 🔄 **${giveaway.prize}** 的新得獎者：${winnerMentions}！`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **抽獎重新抽選** 🔄 **${giveaway.prize}** 的新得獎者：${winnerMentions}！`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Giveaway rerolled (message not found, but announced): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `已重新抽選抽獎活動：${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '獎品',
                                value: giveaway.prize || '神秘獎品！',
                                inline: true
                            },
                            {
                                name: '新得獎者',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: '總參與人數',
                                value: participants.length.toString(),
                                inline: true
                            }
                      ]
                  }
              });
          } catch (logError) {
              logger.debug('Error logging giveaway reroll:', logError);
          }

          return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "重新抽選完成",
                        `已在 ${channel} 公布新得獎者。（找不到原始訊息）。`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
          });
      }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
      );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🔄 **抽獎已重新抽選** 🔄",
            embeds: [newEmbed],
            components: [newRow],
      });

        const winnerMentions = newWinners
            .map((id) => `<@${id}>`)
            .join(",");

        const existingPingMsg = giveaway.winnerPingMessageId
            ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
            : null;
        if (existingPingMsg) {
            await existingPingMsg.edit({
                content: `🔄 **重新抽選得獎者** 🔄 恭喜 ${winnerMentions}！你們是 **${giveaway.prize}** 抽獎活動的新得獎者！請聯絡主辦人 <@${giveaway.hostId}> 來領取您的獎品。`,
            });
        } else {
            const newPingMsg = await channel.send({
                content: `🔄 **重新抽選得獎者** 🔄 恭喜 ${winnerMentions}！你們是 **${giveaway.prize}** 抽獎活動的新得獎者！請聯絡主辦人 <@${giveaway.hostId}> 來領取您的獎品。`,
            });
            updatedGiveaway.winnerPingMessageId = newPingMsg.id;
        }

        logger.info(`Giveaway successfully rerolled: ${messageId} with ${newWinners.length} new winners`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                data: {
                    description: `已重新抽選抽獎活動：${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: '獎品',
                            value: giveaway.prize || '神秘獎品！',
                            inline: true
                        },
                        {
                            name: '新得獎者',
                            value: winnerMentions,
                            inline: false
                        },
                        {
                            name: '總參與人數',
                            value: participants.length.toString(),
                            inline: true
                        }
                    ]
                }
          });
        } catch (logError) {
            logger.debug('Error logging giveaway reroll event:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "重新抽選成功 ✅",
                    `已成功重新抽選位於 ${channel} 的 **${giveaway.prize}** 抽獎活動。選出了 ${newWinners.length} 位新得獎者。`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
      });
    },
};
