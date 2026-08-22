import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
  parseDuration, 
  validatePrize, 
  validateWinnerCount,
  createGiveawayEmbed, 
  createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("在指定的頻道中開始一個新的抽獎活動。")
        .addStringOption((option) =>
          option
              .setName("duration")
              .setDescription(
                  "抽獎應持續的時間（例如：1h、30m、5d）。",
              )
              .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
              .setName("winners")
              .setDescription("要抽取的得獎者人數。")
              .setMinValue(GIVEAWAY_MIN_WINNERS)
              .setMaxValue(GIVEAWAY_MAX_WINNERS)
              .setRequired(true),
        )
        .addStringOption((option) =>
          option
              .setName("prize")
              .setDescription("要送出的獎品。")
              .setRequired(true),
        )
        .addChannelOption((option) =>
          option
              .setName("channel")
              .setDescription("發送抽獎訊息的頻道（預設為目前頻道）。")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // 事先 Defer：發送抽獎訊息加資料庫寫入可能會超過 3 秒的時限
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

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
                "你需要「管理伺服器」權限才能開始抽獎活動。",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new TitanBotError(
                'Target channel is not text-based',
                ErrorTypes.VALIDATION,
                '目標頻道必須是一個文字頻道。',
                { channelId: targetChannel.id, channelType: targetChannel.type }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed = createGiveawayEmbed(initialGiveawayData, "active");
        const row = createGiveawayButtons(false);

        const giveawayMessage = await targetChannel.send({
            content: "🎉 **新抽獎活動** 🎉",
            embeds: [embed],
            components: [row],
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `已建立抽獎活動：${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: '獎品',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: '得獎人數',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: '持續時間',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: '頻道',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway creation event:', logError);
        }

        logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `抽獎活動已開始！ 🎉`,
                    `一場關於 **${prizeName}** 的新抽獎已在 ${targetChannel} 開始，將在 **${durationString}** 後結束。`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
