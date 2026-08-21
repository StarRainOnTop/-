import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { formatDuration } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const INTEREST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 小時領一次利息
const INTEREST_RATE = 0.05; // 每日利息率 5%
const MAX_INTEREST_LIMIT = 10000; // 🛡️ 單次利息上限：$10,000

export default {
    data: new SlashCommandBuilder()
        .setName('interest')
        .setDescription('領取你的每日銀行存款利息（5% 利息，上限 $10,000）'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) {
            throw createError(
                "Failed to load economy data for interest",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        userData.wallet = userData.wallet || 0;
        userData.bank = userData.bank || 0;
        userData.lastInterest = userData.lastInterest || 0;

        // 檢查 24 小時冷卻時間
        if (now < userData.lastInterest + INTEREST_COOLDOWN) {
            const timeRemaining = userData.lastInterest + INTEREST_COOLDOWN - now;
            throw createError(
                "Interest cooldown active",
                ErrorTypes.RATE_LIMIT,
                `您的銀行利息還沒冷卻！請在 **${formatDuration(timeRemaining)}** 後再領取。`,
                { timeRemaining }
            );
        }

        if (userData.bank <= 0) {
            throw createError(
                "No bank balance for interest",
                ErrorTypes.VALIDATION,
                "你的銀行存款為 $0，無法產生利息！請先使用 `/deposit` 存錢進銀行。",
                { bank: userData.bank }
            );
        }

        // 計算 5% 利息
        let interestEarned = Math.floor(userData.bank * INTEREST_RATE);
        
        // 套用單次利息領取上限保護 ($10,000)
        if (interestEarned > MAX_INTEREST_LIMIT) {
            interestEarned = MAX_INTEREST_LIMIT;
        }
        
        if (interestEarned <= 0) {
            throw createError(
                "Interest too low",
                ErrorTypes.VALIDATION,
                "目前的存款金額太少，無法計算出利息。",
                { bank: userData.bank }
            );
        }

        userData.bank += interestEarned;
        userData.lastInterest = now;
        await setEconomyData(client, guildId, userId, userData);

        logger.info(`[ECONOMY] Interest claimed by ${userId}`, { userId, guildId, interestEarned, newBank: userData.bank });

        const embed = successEmbed(
            "📈 成功領取銀行利息！",
            `您的存款幫您賺取了利息，共獲得 **$${interestEarned.toLocaleString()}**！\n*(註：每日利息上限為 $${MAX_INTEREST_LIMIT.toLocaleString()} 以維持經濟平衡)*`
        ).addFields(
            { name: "本次利息收入", value: `+$${interestEarned.toLocaleString()}`, inline: true },
            { name: "目前銀行總存款", value: `$${userData.bank.toLocaleString()}`, inline: true }
        ).setFooter({
            text: "掌握最新影片資訊、交流床戰戰術、尋找優質組隊隊友，快加入我們的伺服器吧！"
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

    }, { command: 'interest' })
};
