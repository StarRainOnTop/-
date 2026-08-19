import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 35 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: '鱸魚 (Bass)', emoji: '🐟', rarity: 'common' },
    { name: '鮭魚 (Salmon)', emoji: '🐟', rarity: 'common' },
    { name: '鱒魚 (Trout)', emoji: '🐟', rarity: 'common' },
    { name: '鮪魚 (Tuna)', emoji: '🐠', rarity: 'uncommon' },
    { name: '旗魚 (Swordfish)', emoji: '🐠', rarity: 'uncommon' },
    { name: '章魚 (Octopus)', emoji: '🐙', rarity: 'rare' },
    { name: '龍蝦 (Lobster)', emoji: '🦞', rarity: 'rare' },
    { name: '鯊魚 (Shark)', emoji: '🦈', rarity: 'epic' },
    { name: '鯨魚 (Whale)', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "你把釣魚線拋向清澈見底的水域...",
    "你耐心地等待著浮標在水面上漂浮...",
    "等待了幾分鐘後，你感覺到了一陣拉扯...",
    "水面泛起漣漪，有東西咬鉤了...",
    "你以精湛的技巧將你的戰利品收回...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('去釣魚以捕捉魚類並賺取金錢'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你現在太累了，無法釣魚。請休息 **${hours}小時 ${minutes}分鐘** 後再試。`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **釣竿加成：+50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const rarityTranslations = {
                common: '普通 (Common)',
                uncommon: '罕見 (Uncommon)',
                rare: '稀有 (Rare)',
                epic: '史詩 (Epic)',
                legendary: '傳說 (Legendary)'
            };

            const embed = createEmbed({
                title: '🎣 釣魚成功！',
                description: `${catchMessage}\n\n你釣到了一隻 **${fishCaught.emoji} ${fishCaught.name}**！你把它賣掉了，賺取了 **$${finalEarned.toLocaleString()}**！${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "新錢包現金餘額",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "稀有度",
                        value: rarityTranslations[fishCaught.rarity],
                        inline: true,
                    }
                )
                .setFooter({ text: `可在 45 分鐘後進行下次釣魚。` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
