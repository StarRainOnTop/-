import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('從你的銀行提款到錢包')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('要提款的金額（數字或 "all"）')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString("amount");

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        if (!userData.bank || userData.bank <= 0) {
            throw createError(
                "Empty bank account",
                ErrorTypes.VALIDATION,
                "您的銀行帳戶目前沒有存款可供提領。",
                { userId, bankBalance: userData.bank }
            );
        }

        let withdrawAmount;

        if (amountInput.toLowerCase() === "all") {
            withdrawAmount = userData.bank;
        } else {
            withdrawAmount = parseInt(amountInput, 10);

            if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    `請輸入有效的數字或 'all'。您輸入的是：\`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        let noticeMessage = "";

        // 提款金額超過銀行存款時自動調整
        if (withdrawAmount > userData.bank) {
            withdrawAmount = userData.bank;
            noticeMessage = `⚠️ 您嘗試提領超過銀行存款的金額，系統已自動為您提領全部存款 **$${withdrawAmount.toLocaleString()}**。`;
        }

        userData.wallet = (userData.wallet || 0) + withdrawAmount;
        userData.bank -= withdrawAmount;

        await setEconomyData(client, guildId, userId, userData);

        const maxBank = getMaxBankCapacity(userData);

        let successDescription = `您已成功從銀行提領了 **$${withdrawAmount.toLocaleString()}**。`;
        if (noticeMessage) {
            successDescription += `\n\n${noticeMessage}`;
        }

        const embed = successEmbed('提款成功', successDescription)
            .addFields(
                {
                    name: "新現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "新銀行存款餘額",
                    value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
