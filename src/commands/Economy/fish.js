import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 35 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

// 擴充至 18 種不同的魚類與水生物（包含 id，方便對應收集冊與背包）
const FISH_TYPES = [
    // --- Common (普通) - 佔 50% ---
    { id: 'bass', name: '鱸魚 (Bass)', emoji: '🐟', rarity: 'common' },
    { id: 'salmon', name: '鮭魚 (Salmon)', emoji: '🐟', rarity: 'common' },
    { id: 'trout', name: '鱒魚 (Trout)', emoji: '🐟', rarity: 'common' },
    { id: 'sardine', name: '沙丁魚 (Sardine)', emoji: '🐟', rarity: 'common' },
    { id: 'seaweed_bundle', name: '海帶束 (Seaweed)', emoji: '🌿', rarity: 'common' },

    // --- Uncommon (罕見) - 佔 25% ---
    { id: 'tuna', name: '鮪魚 (Tuna)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'swordfish', name: '旗魚 (Swordfish)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'pufferfish', name: '河豚 (Pufferfish)', emoji: '🐡', rarity: 'uncommon' },
    { id: 'clownfish', name: '小丑魚 (Clownfish)', emoji: '🐠', rarity: 'uncommon' },

    // --- Rare (稀有) - 佔 15% ---
    { id: 'octopus', name: '章魚 (Octopus)', emoji: '🐙', rarity: 'rare' },
    { id: 'lobster', name: '龍蝦 (Lobster)', emoji: '🦞', rarity: 'rare' },
    { id: 'anglerfish', name: '燈籠魚 (Anglerfish)', emoji: '🏮', rarity: 'rare' },
    { id: 'stingray', name: '扁魟魚 (Stingray)', emoji: '🛸', rarity: 'rare' },

    // --- Epic (史詩) - 佔 8% ---
    { id: 'shark', name: '鯊魚 (Shark)', emoji: '🦈', rarity: 'epic' },
    { id: 'giant_octopus', name: '巨型章魚 (Giant Octopus)', emoji: '🦑', rarity: 'epic' },
    { id: 'electric_eel', name: '電鰻 (Electric Eel)', emoji: '⚡', rarity: 'epic' },

    // --- Legendary (傳說) - 佔 2% ---
    { id: 'whale', name: '鯨魚 (Whale)', emoji: '🐋', rarity: 'legendary' },
    { id: 'leviathan', name: '深海巨獸利維坦 (Leviathan)', emoji: '🌊', rarity: 'legendary' },
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
        const hasFishingRod = userData.inventory?.["fishing_rod"] || 0;

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
        
        // 動態根據稀有度篩選並隨機抽取
        const getFishByRarity = (rarity) => {
            const list = FISH_TYPES.filter(f => f.rarity === rarity);
            return list[Math.floor(Math.random() * list.length)];
        };

        if (rand < 0.5) {
            fishCaught = getFishByRarity('common');
        } else if (rand < 0.75) {
            fishCaught = getFishByRarity('uncommon');
        } else if (rand < 0.9) {
            fishCaught = getFishByRarity('rare');
        } else if (rand < 0.98) {
            fishCaught = getFishByRarity('epic');
        } else {
            fishCaught = getFishByRarity('legendary');
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

        // 1. 更新金錢與冷卻時間
        userData.wallet += finalEarned;
        userData.lastFish = now;

        // 2. 將釣到的魚自動存入背包（供後續收集冊圖鑑使用）
        if (!userData.inventory) userData.inventory = {};
        userData.inventory[fishCaught.id] = (userData.inventory[fishCaught.id] || 0) + 1;

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
            description: `${catchMessage}\n\n你釣到了一隻 **${fishCaught.emoji} ${fishCaught.name}**！你把它賣掉了，賺取了 **$${finalEarned.toLocaleString()}**！${multiplierMessage}\n📦 *(已將該魚類記錄至你的背包與收集冊)*`,
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
            .setFooter({ text: `可在 35 分鐘後進行下次釣魚。` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
