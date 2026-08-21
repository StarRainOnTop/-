import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity, formatCurrency } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 使用 Map 紀錄 userId => 到期時間戳 (Timestamp)
const cooldowns = new Map();
const COOLDOWN_SECONDS = 5; 

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
        const now = Date.now();
        const cooldownAmount = COOLDOWN_SECONDS * 1000;
        const userCooldown = cooldowns.get(interaction.user.id);

        // 1. 檢查冷卻時間是否過期
        if (userCooldown && now < userCooldown) {
            const timeLeft = Math.ceil((userCooldown - now) / 1000);
            return interaction.reply({
                content: `⏳ 請等待 ${timeLeft} 秒後再查詢餘額。`,
                ephemeral: true
            });
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        // 2. 設置冷卻時間戳
        cooldowns.set(interaction.user.id, now + cooldownAmount);
        // 定時清理過期紀錄，避免 Map 無限膨脹
        setTimeout(() => cooldowns.delete(interaction.user.id), cooldownAmount);

        const userOption = interaction.options.getUser("user");
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.info(`[ECONOMY] Balance check - targetUser: ${targetUser.id}, guildId: ${guildId}`);

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "機器人沒有經濟帳戶。"
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

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
            title: `💰 ${targetUser.username} 的財務狀況`,
            description: `這是 ${targetUser} 當前的帳戶餘額資訊。`,
        })
            .addFields(
                {
                    name: "💵 錢包 (Cash)",
                    value: formatCurrency(wallet),
                    inline: true,
                },
                {
                    name: "🏦 銀行 (Bank)",
                    value: `${formatCurrency(bank)} / ${formatCurrency(maxBank)}`,
                    inline: true,
                },
                {
                    name: "📊 總計 (Total)",
                    value: formatCurrency(wallet + bank),
                    inline: true,
                }
            )
            .setFooter({
                text: `由 ${interaction.user.tag} 請求`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
            });

        logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};
