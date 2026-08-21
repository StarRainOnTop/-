import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('將錢包中的現金存入銀行')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('要存入的金額（數字或 "all"）')
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

        const maxBank = getMaxBankCapacity(userData);
        let depositAmount;

        if (amountInput.toLowerCase() === "all") {
            depositAmount = userData.wallet;
        } else {
            depositAmount = parseInt(amountInput, 10);

            if (isNaN(depositAmount) || depositAmount <= 0) {
                throw createError(
                    "Invalid deposit amount",
                    ErrorTypes.VALIDATION,
                    `請輸入有效的數字或 'all'。您輸入的是：\`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        if (userData.wallet <= 0) {
            throw createError(
                "Zero deposit amount",
                ErrorTypes.VALIDATION,
                "您的錢包裡沒有現金可供存款。",
                { userId, walletBalance: userData.wallet }
            );
        }

        let noticeMessage = "";

        // 存款金額超過擁有現金時自動調整
        if (depositAmount > userData.wallet) {
            depositAmount = userData.wallet;
            noticeMessage = `⚠️ 您嘗試存入超過擁有的金額，系統已自動為您存入剩餘全部現金 **$${depositAmount.toLocaleString()}**。`;
        }

        const availableSpace = maxBank - userData.bank;

        if (availableSpace <= 0) {
            throw createError(
                "Bank is full",
                ErrorTypes.VALIDATION,
                `您的銀行目前已滿（最大容量：$${maxBank.toLocaleString()}）。請購買**銀行擴充升級 (Bank Upgrade)** 來增加上限。`,
                { maxBank, currentBank: userData.bank, userId }
            );
        }

        // 存款金額超過銀行剩餘空間時自動調整
        if (depositAmount > availableSpace) {
            depositAmount = availableSpace;
            if (amountInput.toLowerCase() !== "all") {
                noticeMessage = `⚠️ 您的銀行僅剩下 **$${depositAmount.toLocaleString()}** 的空間（上限：$${maxBank.toLocaleString()}），剩餘現金已保留在錢包中。`;
            }
        }

        if (depositAmount <= 0) {
            throw createError(
                "No space or cash for deposit",
                ErrorTypes.VALIDATION,
                "您嘗試存入的金額為 0，或在檢查現金餘額後超出了銀行的容量限制。",
                { depositAmount, availableSpace, walletBalance: userData.wallet }
            );
        }

        userData.wallet -= depositAmount;
        userData.bank += depositAmount;

        await setEconomyData(client, guildId, userId, userData);

        let successDescription = `您已成功將 **$${depositAmount.toLocaleString()}** 存入您的銀行。`;
        if (noticeMessage) {
            successDescription += `\n\n${noticeMessage}`;
        }

        const embed = successEmbed('存款成功', successDescription)
            .addFields(
                {
                    name: "新錢包現金餘額",
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
    }, { command: 'deposit' })
};
