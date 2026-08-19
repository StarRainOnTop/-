import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getEconomyData, removeMoney } from '../../utils/economy.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('bail')
        .setDescription('支付總資產的 1/20 作為保釋金以逃出監獄'),

    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guildId;
            const userId = interaction.user.id;

            // 取得玩家的經濟與狀態資料
            const userData = await getEconomyData(client, guildId, userId);

            // 檢查玩家是否真的在監獄中（假設欄位為 inJail 或 jail）
            if (!userData || !userData.inJail) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '你根本沒有被關在監獄裡！'
                });
            }

            const wallet = userData.wallet || 0;
            const bank = userData.bank || 0;
            const totalWealth = wallet + bank;

            if (totalWealth <= 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '你身無分文，支付不起保釋金！'
                });
            }

            // 計算 1/20 (5%) 的保釋金
            const bailAmount = Math.ceil(totalWealth * 0.05);

            // 優先從錢包扣款，如果錢包不夠則從銀行扣款
            let deductType = 'wallet';
            if (wallet < bailAmount) {
                deductType = 'bank';
                // 如果連銀行總額都不夠付保釋金
                if (bank < bailAmount) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: `你的總資產不足以支付保釋金。保釋金需要 **$${bailAmount.toLocaleString()}**。`
                    });
                }
            }

            // 扣除保釋金
            await removeMoney(client, guildId, userId, bailAmount, deductType);

            // 解除監獄狀態
            userData.inJail = false;
            userData.jailUntil = null; // 如果有設定刑期時間的話
            
            // 儲存更新後的玩家資料
            const economyKey = `economy:${guildId}:${userId}`;
            await client.db.set(economyKey, userData);

            // 回覆成功訊息
            const embed = new EmbedBuilder()
                .setTitle('🔓 保釋成功')
                .setDescription(`你支付了 **$${bailAmount.toLocaleString()}**（總資產的 1/20）的保釋金，成功順利出獄！`)
                .setColor(getColor('success'))
                .setTimestamp();

            return await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                ephemeral: true,
            });

        } catch (error) {
            logger.error('bail command error:', error);
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: '執行保釋指令時發生未預期的錯誤。'
            });
        }
    },
};
