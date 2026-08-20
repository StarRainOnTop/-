import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// 必須與 fish.js 裡的魚類清單保持完全一致
const FISH_TYPES = [
    { id: 'bass', name: '鱸魚 (Bass)', emoji: '🐟', rarity: 'common' },
    { id: 'salmon', name: '鮭魚 (Salmon)', emoji: '🐟', rarity: 'common' },
    { id: 'trout', name: '鱒魚 (Trout)', emoji: '🐟', rarity: 'common' },
    { id: 'sardine', name: '沙丁魚 (Sardine)', emoji: '🐟', rarity: 'common' },
    { id: 'seaweed_bundle', name: '海帶束 (Seaweed)', emoji: '🌿', rarity: 'common' },
    { id: 'tuna', name: '鮪魚 (Tuna)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'swordfish', name: '旗魚 (Swordfish)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'pufferfish', name: '河豚 (Pufferfish)', emoji: '🐡', rarity: 'uncommon' },
    { id: 'clownfish', name: '小丑魚 (Clownfish)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'octopus', name: '章魚 (Octopus)', emoji: '🐙', rarity: 'rare' },
    { id: 'lobster', name: '龍蝦 (Lobster)', emoji: '🦞', rarity: 'rare' },
    { id: 'anglerfish', name: '燈籠魚 (Anglerfish)', emoji: '🏮', rarity: 'rare' },
    { id: 'stingray', name: '扁魟魚 (Stingray)', emoji: '🛸', rarity: 'rare' },
    { id: 'shark', name: '鯊魚 (Shark)', emoji: '🦈', rarity: 'epic' },
    { id: 'giant_octopus', name: '巨型章魚 (Giant Octopus)', emoji: '🦑', rarity: 'epic' },
    { id: 'electric_eel', name: '電鰻 (Electric Eel)', emoji: '⚡', rarity: 'epic' },
    { id: 'whale', name: '鯨魚 (Whale)', emoji: '🐋', rarity: 'legendary' },
    { id: 'leviathan', name: '深海巨獸利維坦 (Leviathan)', emoji: '🌊', rarity: 'legendary' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('查看你的釣魚圖鑑收集進度'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const userData = await getEconomyData(client, guildId, userId);
        const inventory = userData.inventory || {};

        let collectedCount = 0;
        let description = "以下是你的釣魚圖鑑收集進度：\n\n";

        // 依照稀有度分類顯示
        const rarities = [
            { key: 'common', name: '🟢 普通 (Common)' },
            { key: 'uncommon', name: '🔵 罕見 (Uncommon)' },
            { key: 'rare', name: '🟣 稀有 (Rare)' },
            { key: 'epic', name: '🟠 史詩 (Epic)' },
            { key: 'legendary', name: '🟡 傳說 (Legendary)' }
        ];

        for (const r of rarities) {
            const fishesInRarity = FISH_TYPES.filter(f => f.rarity === r.key);
            let rarityText = `**${r.name}**\n`;

            for (const fish of fishesInRarity) {
                const count = inventory[fish.id] || 0;
                if (count > 0) {
                    collectedCount++;
                    rarityText += `> ${fish.emoji} ${fish.name} x**${count}**\n`;
                } else {
                    rarityText += `> ❓ ~~${fish.name}~~ (未解鎖)\n`;
                }
            }
            description += rarityText + "\n";
        }

        const totalFish = FISH_TYPES.length;
        const percent = Math.floor((collectedCount / totalFish) * 100);

        const embed = createEmbed({
            title: `🎣 ${interaction.user.username} 的釣魚圖鑑`,
            description: description,
            color: '#3498DB'
        }).addFields(
            { name: "總收集進度", value: `**${collectedCount} / ${totalFish}** (${percent}%)`, inline: false }
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'collection' })
};
