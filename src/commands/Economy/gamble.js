import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('賭博你的金錢以贏取更多現金')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('要賭博的現金金額')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const betAmount = interaction.options.getInteger("amount");
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastGamble = userData.lastGamble || 0;
            let cloverCount = userData.inventory["lucky_clover"] || 0;
            let charmCount = userData.inventory["lucky_charm"] || 0;

            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Gamble cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你需要冷靜一下才能再次賭博。請等待 **${minutes}分 ${seconds}秒**。`,
                    { remaining, cooldownType: 'gamble' }
                );
            }

            if (userData.wallet < betAmount) {
                throw createError(
                    "Insufficient cash for gamble",
                    ErrorTypes.VALIDATION,
                    `你只有 $${userData.wallet.toLocaleString()} 現金，但你正試圖下注 $${betAmount.toLocaleString()}。`,
                    { required: betAmount, current: userData.wallet }
                );
            }

            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;
            let usedCharm = false;

            if (cloverCount > 0) {
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **已消耗幸運草：** 你的勝率提升了！`;
                usedClover = true;
            }
            
            else if (charmCount > 0) {
                winChance += CHARM_WIN_BONUS;
                userData.inventory["lucky_charm"] -= 1;
                cloverMessage = `\n🍀 **已使用幸運護符（剩餘 ${charmCount - 1} 次）：** 你的勝率提升了！`;
                usedCharm = true;
            }

            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                cashChange = amountWon - betAmount;

                resultEmbed = successEmbed(
                    "🎉 你贏了！",
                    `你成功賭博並將 **$${betAmount.toLocaleString()}** 的下注變成了 **$${amountWon.toLocaleString()}**！${cloverMessage}`,
                );
            } else {
                cashChange = -betAmount;

                resultEmbed = warningEmbed(
                    "💔 你輸了...",
                    `骰子對你不利。你輸掉了 **$${betAmount.toLocaleString()}** 的下注。`,
                );
            }

            userData.wallet = (userData.wallet || 0) + cashChange;
            userData.lastGamble = now;

            await setEconomyData(client, guildId, userId, userData);

            const newCash = userData.wallet;

            resultEmbed.addFields({
                name: "新錢包現金餘額",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `你還剩 ${userData.inventory["lucky_clover"]} 個幸運草。當前勝率為 ${Math.round(winChance * 100)}%。`,
                });
            } else if (usedCharm) {
                resultEmbed.setFooter({
                    text: `你還剩 ${userData.inventory["lucky_charm"]} 次幸運護符使用機會。當前勝率為 ${Math.round(winChance * 100)}%。`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `可在 5 分鐘後再次賭博。基礎勝率：${Math.round(BASE_WIN_CHANCE * 100)}%。`,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
};
