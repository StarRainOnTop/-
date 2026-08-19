import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 15 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('乞討一小筆金額'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "無法載入您的經濟數據，請稍後再試。",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} 分鐘` : `${seconds} 秒`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你乞討得太累了！請在 **${timeMessage}** 後再試。`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `一位好心的陌生人往你的杯子裡投了 **$${amountWon.toLocaleString()}**。`,
                    `你發現了一個沒人注意的錢包！你抓起 **$${amountWon.toLocaleString()}** 然後立刻逃跑。`,
                    `有人對你心生憐憫，給了你 **$${amountWon.toLocaleString()}**！`,
                    `你在公園長椅底下找到了 **$${amountWon.toLocaleString()}**。`,
                ];

                replyEmbed = successEmbed(
                    '乞討成功',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "警察把你趕走了，你什麼也沒有得到。",
                    "有人大喊：「去找個工作吧！」然後從你身邊走了過去。",
                    "一隻松鼠偷走了你身上僅存的一枚硬幣。",
                    "你試著開口乞討，但覺得太尷尬便放棄了。",
                ];

                replyEmbed = warningEmbed(
                    '乞討失敗',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
