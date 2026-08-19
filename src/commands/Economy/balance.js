import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 用於儲存冷卻中的使用者 ID 和過期時間戳
const cooldowns = new Set();
const COOLDOWN_SECONDS = 5; // 可在此處修改冷卻時間（秒）

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("查看你或其他人的帳戶餘額")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('要查詢餘額的使用者')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        // 1. 在執行耗時操作前檢查冷卻狀態
        if (cooldowns.has(interaction.user.id)) {
            return interaction.reply({
                content: `⏳ 請等待 ${COOLDOWN_SECONDS} 秒後再查詢餘額。`,
                ephemeral: true
            });
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        // 2. 將使用者加入冷卻，並設定計時器在指定時間後移除
        cooldowns.add(interaction.user.id);
        setTimeout(() => {
            cooldowns.delete(interaction.user.id);
        }, COOLDOWN_SECONDS * 1000);

        const userOption = interaction.options.getUser("user");
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.info(`[ECONOMY] Balance check - userOption: ${userOption?.id || 'null'}, targetUser: ${targetUser.id}, guildId: ${guildId}, isPrefix: ${!!interaction._commandStartTime}`);

        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "機器人沒有經濟帳戶。"
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        logger.info(`[ECONOMY] Economy data retrieved - userData:`, userData);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "載入經濟數據失敗，請稍後再試。",
                { userId: targetUser.id, guildId }
            );
        }

        const maxBank = getMaxBankCapacity(userData);

        const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
        const bank = typeof userData.bank === 'number' ? userData.bank : 0;

        const embed = createEmbed({
            title: `${targetUser.username} 的餘額`,
            description: `這是 ${targetUser.username} 當前的財務狀況。`,
        })
            .addFields(
                {
                    name: "💵 錢包 (Cash)",
                    value: `$${wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "🏦 銀行 (Bank)",
                    value: `$${bank.toLocaleString()} / ${maxBank.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "💰 總計 (Total)",
                    value: `$${(wallet + bank).toLocaleString()}`,
                    inline: true,
                }
            )
            .setFooter({
                text: `由 ${interaction.user.tag} 請求`,
                iconURL: interaction.user.displayAvatarURL(),
            });

        logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};
