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

// 🟢 請在這裡填入你伺服器「集滿挖礦地點」的專屬身分組 ID
const MINE_SPECIAL_ROLE_ID = '1540058291064012902';

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

        let userData = await getEconomyData(client, guildId, userId);
        
        // 🛡️ 防呆保護：如果玩家沒有經濟資料，自動初始化一個預設結構
        if (!userData) {
            userData = {
                wallet: 0,
                bank: 0,
                lastMine: 0,
                inventory: {},
                minedLocations: {}
            };
        }

        const lastMine = userData.lastMine || 0;
        const hasDiamondPickaxe = userData.inventory?.["diamond_pickaxe"] || 0;
        const hasPickaxe = userData.inventory?.["pickaxe"] || 0;

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

        const locationObj = MINE_LOCATIONS[Math.floor(Math.random() * MINE_LOCATIONS.length)];

        userData.wallet = (userData.wallet || 0) + finalEarned;
        userData.lastMine = now;

        // 記錄探索地點進度
        if (!userData.minedLocations) userData.minedLocations = {};
        userData.minedLocations[locationObj.id] = (userData.minedLocations[locationObj.id] || 0) + 1;

        await setEconomyData(client, guildId, userId, userData);

        // 檢查是否集滿所有挖礦地點
        let roleAwardedMessage = "";
        try {
            const member = await interaction.guild.members.fetch(userId);
            const hasAllLocations = MINE_LOCATIONS.every(loc => (userData.minedLocations[loc.id] || 0) > 0);
            
            if (hasAllLocations && MINE_SPECIAL_ROLE_ID && MINE_SPECIAL_ROLE_ID !== '你的挖礦身分組ID數字') {
                if (!member.roles.cache.has(MINE_SPECIAL_ROLE_ID)) {
                    await member.roles.add(MINE_SPECIAL_ROLE_ID);
                    roleAwardedMessage = `\n🎉 **恭喜！你探索了所有 12 個挖礦地點，獲得了傳說礦工專屬身分組！**`;
                }
            }
        } catch (err) {
            console.error("自動發放挖礦身分組失敗:", err);
        }

        const embed = successEmbed(
            "💰 挖礦探險成功！",
            `你探索了 **${locationObj.name}** 並設法找到了價值 **$${finalEarned.toLocaleString()}** 的礦物！${multiplierMessage}${roleAwardedMessage}\n🗺️ *(已將此探索地點記錄至你的收集冊)*`,
        )
            .addFields({
                name: "新錢包現金餘額",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            })
            .setFooter({ text: `可在 35 分鐘後進行下次挖礦。` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};
