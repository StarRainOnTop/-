import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MINE_COOLDOWN = 35 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "廢棄金礦",
    "黑暗潮濕的洞穴",
    "後院的岩石採石場",
    "火山黑曜石噴氣口",
    "深海礦物海溝",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('去挖礦以賺取金錢'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastMine = userData.lastMine || 0;
            const hasDiamondPickaxe = userData.inventory["diamond_pickaxe"] || 0;
            const hasPickaxe = userData.inventory["pickaxe"] || 0;

            if (now < lastMine + MINE_COOLDOWN) {
                const remaining = lastMine + MINE_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Mining cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你的十字鎬正在冷卻中。請等待 **${hours}小時 ${minutes}分鐘** 後再次挖礦。`,
                    { remaining, cooldownType: 'mine' }
                );
            }

            const baseEarned =
                Math.floor(
                    Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
                ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasDiamondPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
                multiplierMessage = `\n💎 **鑽石鎬加成：+100%**`;
            } else if (hasPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
                multiplierMessage = `\n⛏️ **十字鎬加成：+20%**`;
            }

            const location =
                MINE_LOCATIONS[
                    Math.floor(Math.random() * MINE_LOCATIONS.length)
                ];

            userData.wallet += finalEarned;
            userData.lastMine = now;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 挖礦探險成功！",
                `你探索了 **${location}** 並設法找到了價值 **$${finalEarned.toLocaleString()}** 的礦物！${multiplierMessage}`,
            )
                .addFields({
                    name: "新錢包現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({ text: `可在 1 小時後進行下次挖礦。` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};
