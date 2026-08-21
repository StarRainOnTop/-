import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRATE_PRICE = 5000; // 單抽價格

// 獎品池設定
const PRIZE_POOL = [
    { id: 'cash_small', name: '💵 現金紅包 ($1,000)', type: 'cash', value: 1000, weight: 45, rarity: '普通' },
    { id: 'personal_safe', name: '🛡️ 個人保險箱 (防禦次數 +1)', type: 'item', value: 1, weight: 30, rarity: '稀有' },
    { id: 'diamond_pickaxe', name: '⛏️ 鑽石鎬', type: 'item', value: 1, weight: 15, rarity: '史詩' },
    { id: 'cash_jackpot', name: '💰巨額頭獎💰 ($50,000)', type: 'cash', value: 50000, weight: 7, rarity: '傳說' },
    { id: 'golden_crown_role', name: '👑尊爵黃金皇冠👑 (專屬身分組)', type: 'role', roleId: '1540406574189649940', weight: 3, rarity: '神話' }
];

function rollCrate() {
    const totalWeight = PRIZE_POOL.reduce((sum, prize) => sum + prize.weight, 0);
    let randomNum = Math.random() * totalWeight;

    for (const prize of PRIZE_POOL) {
        if (randomNum < prize.weight) {
            return prize;
        }
        randomNum -= prize.weight;
    }
    return PRIZE_POOL[0];
}

export default {
    data: new SlashCommandBuilder()
        .setName('crate')
        .setDescription('開啟高級抽獎箱，拼手氣贏取巨額現金與傳說級皇冠身分組！')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('抽獎次數')
                .setRequired(false)
                .addChoices(
                    { name: '單抽 ($5,000)', value: 1 },
                    { name: '10 連抽 ($50,000)', value: 10 }
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const count = interaction.options.getInteger('amount') || 1;
        const totalPrice = CRATE_PRICE * count;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        userData.wallet = userData.wallet || 0;
        userData.bank = userData.bank || 0;
        const totalWealth = userData.wallet + userData.bank;

        if (totalWealth < totalPrice) {
            throw createError(
                "Not enough money",
                ErrorTypes.VALIDATION,
                `你的總資產不足！進行 ${count} 連抽需要 **$${totalPrice.toLocaleString()}**（你目前擁有 $${totalWealth.toLocaleString()}）。`,
                { totalWealth, totalPrice }
            );
        }

        // 扣款邏輯（現金優先，不夠扣銀行）
        if (userData.wallet >= totalPrice) {
            userData.wallet -= totalPrice;
        } else {
            const remaining = totalPrice - userData.wallet;
            userData.wallet = 0;
            userData.bank = Math.max(0, userData.bank - remaining);
        }

        const results = [];
        let totalCashWon = 0;
        const member = interaction.member;

        for (let i = 0; i < count; i++) {
            const prize = rollCrate();
            results.push(prize);

            if (prize.type === 'cash') {
                totalCashWon += prize.value;
                userData.wallet += prize.value;
            } else if (prize.type === 'item') {
                // 直接將對應的道具數量 +1（完美對應你的 inventory 系統）
                userData.inventory = userData.inventory || {};
                userData.inventory[prize.id] = (userData.inventory[prize.id] || 0) + prize.value;
            } else if (prize.type === 'role') {
                try {
                    if (prize.roleId) {
                        await member.roles.add(prize.roleId);
                    }
                } catch (err) {
                    logger.error(`[CRATE] Failed to assign role: ${err.message}`);
                }
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        const resultSummary = results.map((p, index) => `**#${index + 1}** [${p.rarity}] ${p.name}`).join('\n');

        const embed = createEmbed({
            title: `🎁 ${interaction.user.username} 的開箱結果 (${count}連抽)`,
            description: `花費金額：**$${totalPrice.toLocaleString()}**\n\n獲得獎勵：\n${resultSummary}`,
            color: 'success',
            timestamp: true
        });

        if (totalCashWon > 0) {
            embed.addFields({ name: '💰 現金回饋', value: `恭喜抽中現金共 **+$${totalCashWon.toLocaleString()}**！`, inline: false });
        }

        embed.addFields({
            name: '💳 更新後餘額',
            value: `現金: $${userData.wallet.toLocaleString()} | 銀行: $${userData.bank.toLocaleString()}`,
            inline: false
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'crate' })
};
