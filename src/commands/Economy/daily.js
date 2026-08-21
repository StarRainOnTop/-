import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { formatDuration } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/bot.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 小時
const STREAK_RESET_WINDOW = 48 * 60 * 60 * 1000; // 48 小時（超過這段時間沒領就會斷簽）
const DAILY_AMOUNT = botConfig.economy?.dailyAmount ?? 200;
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('領取你的每日現金獎勵（連續領取每 2 天額外 +$50）'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data for daily",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }
        
        const lastDaily = userData.lastDaily || 0;

        // 檢查冷卻時間 (24 小時內不可重複領取)
        if (now < lastDaily + DAILY_COOLDOWN) {
            const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
            throw createError(
                "Daily cooldown active",
                ErrorTypes.RATE_LIMIT,
                `您需要等待一段時間才能再次領取每日獎勵。請在 **${formatDuration(timeRemaining)}** 後再試。`,
                { timeRemaining, cooldownType: 'daily' }
            );
        }

        // 📈 連續簽到 (Streak) 計算與斷簽邏輯
        let currentStreak = userData.dailyStreak || 0;
        if (lastDaily === 0 || now - lastDaily <= STREAK_RESET_WINDOW) {
            currentStreak += 1;
        } else {
            currentStreak = 1;
        }

        const streakBonus = Math.floor((currentStreak - 1) / 2) * 50;

        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        let earned = DAILY_AMOUNT + streakBonus;
        let bonusMessage = "";
        let hasPremiumRole = false;

        if (
            PREMIUM_ROLE_ID &&
            interaction.member &&
            interaction.member.roles.cache.has(PREMIUM_ROLE_ID)
        ) {
            const premiumBonus = Math.floor(
                DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
            );
            earned += premiumBonus;
            bonusMessage += `\n✨ **高級會員加成：** +$${premiumBonus.toLocaleString()}`;
            hasPremiumRole = true;
        }

        if (streakBonus > 0) {
            bonusMessage += `\n🔥 **連續簽到獎勵 (第 ${currentStreak}天)：** +$${streakBonus.toLocaleString()}`;
        }

        userData.wallet = (userData.wallet || 0) + earned;
        userData.lastDaily = now;
        userData.dailyStreak = currentStreak;
        userData.reminderSent = false; // 重置提醒狀態，代表這個新週期還沒發過提醒

        await setEconomyData(client, guildId, userId, userData);
        const claimTimestamp = now;

        logger.info(`[ECONOMY_TRANSACTION] Daily claimed`, {
            userId,
            guildId,
            amount: earned,
            streak: currentStreak,
            newWallet: userData.wallet,
            hasPremium: hasPremiumRole,
            timestamp: new Date().toISOString()
        });

        const embed = successEmbed(
            "✅ 每日獎勵領取成功！",
            `您已成功領取您的每日獎勵 **$${earned.toLocaleString()}**！${bonusMessage}`
        )
            .addFields(
                {
                    name: "連續簽到天數",
                    value: `🔥 ${currentStreak} 天`,
                    inline: true,
                },
                {
                    name: "新錢包現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                }
            )
            .setFooter({
                text: hasPremiumRole
                    ? `可在 24 小時後再次領取。（高級會員已生效）`
                    : `可在 24 小時後再次領取。`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        // ⏰ 精準 24 小時後觸發提醒
        setTimeout(async () => {
            try {
                const latestData = await getEconomyData(client, guildId, userId);
                
                // 1. 如果資料不存在，或是玩家在這段時間內已經領過新的一次獎勵，直接返回
                if (!latestData || latestData.lastDaily !== claimTimestamp) {
                    return;
                }

                // 2. 嚴格檢查：如果當前時間已經超過「領取時間 + 48小時」（也就是像你說的 1號領，拖到 3號才要發的情況），
                // 代表他已經過了一整天（2號）都沒有上線，直接視為過期，「絕對不發私訊騷擾」！
                const currentTime = Date.now();
                if (currentTime > claimTimestamp + STREAK_RESET_WINDOW) {
                    return;
                }

                // 3. 確保這個週期的提醒還沒發過，且玩家確實還沒領
                if (latestData.reminderSent) {
                    return;
                }

                // 標記已經發送過提醒，避免重複發送
                latestData.reminderSent = true;
                await setEconomyData(client, guildId, userId, latestData);

                // 發送私訊提醒
                const user = await client.users.fetch(userId);
                if (user) {
                    const dmEmbed = createEmbed({
                        title: "⏰ 每日獎勵已刷新！",
                        description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！\n\n*掌握最新影片資訊、交流床戰戰術、尋找優質組隊隊友，快加入我們的伺服器吧！*`
                    });
                    await user.send({ embeds: [dmEmbed] });
                }
            } catch (err) {
                logger.warn(`Could not send daily reminder DM to user ${userId}: ${err.message}`);
            }
        }, DAILY_COOLDOWN);

    }, { command: 'daily' })
};
