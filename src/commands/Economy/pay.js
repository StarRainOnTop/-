import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('轉帳一些你的現金給其他使用者')
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
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
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

            const result = await EconomyService.transferMoney(
                client, 
                guildId, 
                senderId, 
                receiver.id, 
                amount
            );

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
                )
                .setFooter({
                    text: `已轉帳給 ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData.wallet,
                receiverBalance: updatedReceiverData.wallet
            });

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
    }, { command: 'pay' })
};
