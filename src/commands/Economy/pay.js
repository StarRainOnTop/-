import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

const DAILY_TRANSFER_LIMIT = 10000; // 每日轉帳上限 $10,000
const COOLDOWN_MS = 5 * 60 * 1000; // 5 分鐘冷卻時間 (毫秒)

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('轉帳一些你的現金給其他使用者（每日上限 $10k，冷卻 5 分鐘）')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('要轉帳的使用者')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('轉帳金額')
                .setRequired(true)
                .setMinValue(1)
        )
        .addBooleanOption(option =>
            option
                .setName('dm')
                .setDescription('是否發送私訊通知收款人（預設為開啟）')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        // 取得使用者設定的 DM 開關，若未填則預設為 true (開啟)
        const sendDm = interaction.options.getBoolean("dm") ?? true;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Pay command initiated`, { 
            senderId, 
            receiverId: receiver.id,
            amount,
            sendDm,
            guildId
        });

        if (receiver.bot) {
            throw createError(
                "Cannot pay bot",
                ErrorTypes.VALIDATION,
                "你不能轉帳給機器人。",
                { receiverId: receiver.id, isBot: true }
            );
        }
        
        if (receiver.id === senderId) {
            throw createError(
                "Cannot pay self",
                ErrorTypes.VALIDATION,
                "你不能轉帳給自己。",
                { senderId, receiverId: receiver.id }
            );
        }
        
        if (amount <= 0) {
            throw createError(
                "Invalid payment amount",
                ErrorTypes.VALIDATION,
                "轉帳金額必須大於零。",
                { amount, senderId }
            );
        }

        const [senderData, receiverData] = await Promise.all([
            getEconomyData(client, guildId, senderId),
            getEconomyData(client, guildId, receiver.id)
        ]);

        if (!senderData) {
            throw createError(
                "Failed to load sender economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId: senderId, guildId }
            );
        }
        
        if (!receiverData) {
            throw createError(
                "Failed to load receiver economy data",
                ErrorTypes.DATABASE,
                "無法載入收款人的經濟數據，請稍後再試。",
                { userId: receiver.id, guildId }
            );
        }

        const now = Date.now();
        const todayDateString = new Date(now).toDateString();

        // ⏱️ 檢查 5 分鐘冷卻時間 (Cooldown)
        senderData.lastTransferTimestamp = senderData.lastTransferTimestamp || 0;
        const timeElapsed = now - senderData.lastTransferTimestamp;

        if (timeElapsed < COOLDOWN_MS) {
            const timeLeftMs = COOLDOWN_MS - timeElapsed;
            const minutesLeft = Math.floor(timeLeftMs / 60000);
            const secondsLeft = Math.floor((timeLeftMs % 60000) / 1000);
            
            throw createError(
                "Transfer on cooldown",
                ErrorTypes.VALIDATION,
                `轉帳冷卻中！你必須等待 **${minutesLeft} 分 ${secondsLeft} 秒** 後才能再次進行轉帳。`,
                { timeLeftMs }
            );
        }

        // 📅 每日轉帳額度檢查與跨日重置邏輯
        senderData.lastTransferDate = senderData.lastTransferDate || todayDateString;
        senderData.dailyTransferUsed = senderData.dailyTransferUsed || 0;

        if (senderData.lastTransferDate !== todayDateString) {
            senderData.lastTransferDate = todayDateString;
            senderData.dailyTransferUsed = 0;
        }

        // 檢查是否超過每日 $10,000 上限
        if (senderData.dailyTransferUsed + amount > DAILY_TRANSFER_LIMIT) {
            const remainingLimit = DAILY_TRANSFER_LIMIT - senderData.dailyTransferUsed;
            throw createError(
                "Daily transfer limit exceeded",
                ErrorTypes.VALIDATION,
                `已超過每日轉帳額度限制！你今天已經轉帳了 **$${senderData.dailyTransferUsed.toLocaleString()}**，今日剩餘可轉帳額度為 **$${Math.max(0, remainingLimit).toLocaleString()}**（上限 $10,000）。`,
                { dailyUsed: senderData.dailyTransferUsed, amount, limit: DAILY_TRANSFER_LIMIT }
            );
        }

        const result = await EconomyService.transferMoney(
            client, 
            guildId, 
            senderId, 
            receiver.id, 
            amount
        );

        // 更新轉帳額度、冷卻時間戳記並儲存
        senderData.dailyTransferUsed += amount;
        senderData.lastTransferTimestamp = now;
        await setEconomyData(client, guildId, senderId, senderData);

        const updatedSenderData = await getEconomyData(client, guildId, senderId);
        const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

        const embed = successEmbed(
            '💳 轉帳成功',
            `你已成功轉帳 **$${amount.toLocaleString()}** 給 **${receiver.username}**！`
        )
            .addFields(
                {
                    name: "轉帳金額",
                    value: `$${amount.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "你的新餘額",
                    value: `$${updatedSenderData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "今日剩餘轉帳額度",
                    value: `$${(DAILY_TRANSFER_LIMIT - updatedSenderData.dailyTransferUsed).toLocaleString()} / $10,000`,
                    inline: false,
                }
            )
            .setFooter({
                text: `已轉帳給 ${receiver.tag} • 冷卻 5 分鐘`,
                iconURL: receiver.displayAvatarURL(),
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`[ECONOMY] Payment sent successfully`, {
            senderId,
            receiverId: receiver.id,
            amount,
            sendDm,
            senderBalance: updatedSenderData.wallet,
            receiverBalance: updatedReceiverData.wallet,
            dailyUsed: updatedSenderData.dailyTransferUsed
        });

        // ✉️ 根據使用者選擇的 dm 參數決定是否發送私訊
        if (sendDm) {
            try {
                const receiverEmbed = createEmbed({ 
                    title: "💵 收到入帳通知！", 
                    description: `${interaction.user.username} 轉帳了 **$${amount.toLocaleString()}** 給你。` 
                }).addFields({
                    name: "你的新現金餘額",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
            }
        }
    }, { command: 'pay' })
};
