import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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

const MINE_LOCATIONS = [
    { id: 'abandoned_lab', name: '廢棄的地下實驗室' },
    { id: 'ancient_mine', name: '深山古老礦坑' },
    { id: 'surface_quarry', name: '荒野地表採石場' },
    { id: 'volcanic_crack', name: '火山岩地質裂縫' },
    { id: 'crystal_cave', name: '神祕水晶洞窟' },
    { id: 'sunken_tunnel', name: '沉沒的地鐵隧道' },
    { id: 'lava_river', name: '地底熔岩河畔' },
    { id: 'fossil_site', name: '遠古巨獸的化石遺址' },
    { id: 'weathered_cliff', name: '高山風化岩壁' },
    { id: 'meteorite_crater', name: '神祕隕石墜落坑' },
    { id: 'water_junction', name: '地下地下水脈交界處' },
    { id: 'lost_dungeon', name: '黑暗的失落地下城' }
];

const WORK_JOBS = [
    { id: 'software_engineer', name: '軟體工程師' },
    { id: 'barista', name: '咖啡師' },
    { id: 'cleaner', name: '清潔工' },
    { id: 'youtuber', name: 'YouTuber' },
    { id: 'bot_developer', name: 'Discord 機器人開發者' },
    { id: 'cashier', name: '收銀員' },
    { id: 'delivery', name: '披薩外送員' },
    { id: 'librarian', name: '圖書館員' },
    { id: 'gardener', name: '園丁' },
    { id: 'data_analyst', name: '資料分析師' },
];

// 產生頁面內容與按鈕的輔助函式
function generatePage(page, userData, username) {
    const row = new ActionRowBuilder();

    if (page === 'fish') {
        const inventory = userData.inventory || {};
        let collectedCount = 0;
        let description = "以下是你的 **釣魚圖鑑** 收集進度：\n\n";

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
            title: `🎣 ${username} 的收集冊 (第 1 頁 / 共 3 頁)`,
            description: description,
            color: '#3498DB'
        }).addFields(
            { name: "釣魚收集進度", value: `**${collectedCount} / ${totalFish}** (${percent}%)`, inline: false }
        );

        row.addComponents(
            new ButtonBuilder().setCustomId('col_fish').setLabel('🎣 釣魚').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('col_mine').setLabel('⛏️ 挖礦').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('col_work').setLabel('💼 工作').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row] };

    } else if (page === 'mine') {
        const minedLocations = userData.minedLocations || {};
        let collectedCount = 0;
        let description = "以下是你的 **挖礦探索地點** 收集進度：\n\n> ⛏️ **地下與荒野世界**\n\n";

        for (const loc of MINE_LOCATIONS) {
            const count = minedLocations[loc.id] || 0;
            if (count > 0) {
                collectedCount++;
                description += `> 💎 **${loc.name}** (已探索 ${count} 次)\n`;
            } else {
                description += `> ❓ ~~${loc.name}~~ (未探索)\n`;
            }
        }

        const totalLocs = MINE_LOCATIONS.length;
        const percent = Math.floor((collectedCount / totalLocs) * 100);

        const embed = createEmbed({
            title: `⛏️ ${username} 的收集冊 (第 2 頁 / 共 3 頁)`,
            description: description,
            color: '#E67E22'
        }).addFields(
            { name: "挖礦探索進度", value: `**${collectedCount} / ${totalLocs}** (${percent}%)`, inline: false }
        );

        row.addComponents(
            new ButtonBuilder().setCustomId('col_fish').setLabel('🎣 釣魚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('col_mine').setLabel('⛏️ 挖礦').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('col_work').setLabel('💼 工作').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row] };

    } else {
        const workedJobs = userData.workedJobs || {};
        let collectedCount = 0;
        let description = "以下是你的 **職場履歷與職業** 收集進度：\n\n> 💼 **社會各界職業**\n\n";

        for (const job of WORK_JOBS) {
            const count = workedJobs[job.id] || 0;
            if (count > 0) {
                collectedCount++;
                description += `> ✨ **${job.name}** (已體驗 ${count} 次)\n`;
            } else {
                description += `> ❓ ~~${job.name}~~ (未體驗)\n`;
            }
        }

        const totalJobs = WORK_JOBS.length;
        const percent = Math.floor((collectedCount / totalJobs) * 100);

        const embed = createEmbed({
            title: `💼 ${username} 的收集冊 (第 3 頁 / 共 3 頁)`,
            description: description,
            color: '#2ECC71'
        }).addFields(
            { name: "職場職業進度", value: `**${collectedCount} / ${totalJobs}** (${percent}%)`, inline: false }
        );

        row.addComponents(
            new ButtonBuilder().setCustomId('col_fish').setLabel('🎣 釣魚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('col_mine').setLabel('⛏️ 挖礦').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('col_work').setLabel('💼 工作').setStyle(ButtonStyle.Primary).setDisabled(true)
        );

        return { embeds: [embed], components: [row] };
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('查看你的釣魚圖鑑、挖礦探索與職場職業收集進度'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const username = interaction.user.username;

        const userData = await getEconomyData(client, guildId, userId);
        const initialMessage = generatePage('fish', userData, username);

        const reply = await interaction.editReply(initialMessage);

        const collector = reply.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 60000 
        });

        collector.on('collect', async i => {
            const freshUserData = await getEconomyData(client, guildId, userId);
            let targetPage = 'fish';

            if (i.customId === 'col_fish') targetPage = 'fish';
            else if (i.customId === 'col_mine') targetPage = 'mine';
            else if (i.customId === 'col_work') targetPage = 'work';

            const nextPageData = generatePage(targetPage, freshUserData, username);
            await i.update(nextPageData);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('col_fish').setLabel('🎣 釣魚').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('col_mine').setLabel('⛏️ 挖礦').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('col_work').setLabel('💼 工作').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await interaction.editReply({ components: [disabledRow] });
            } catch (err) {
                // 忽略訊息已被刪除等錯誤
            }
        });
    }, { command: 'collection' })
};
