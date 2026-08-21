import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('查看你的經濟背包道具、升級項目與護罩狀態'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        logger.debug(`[ECONOMY] Inventory requested for ${userId}`, { userId, guildId });

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data for inventory",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        const inventory = userData.inventory || {};
        const upgrades = userData.upgrades || {};
        const shieldExpiresAt = userData.shieldExpiresAt || 0;

        // 1. 一般背包道具解析
        const inventoryLines = Object.entries(inventory)
            .filter(([_, quantity]) => quantity > 0)
            .map(([itemId, quantity]) => {
                const item = shopItems.find(i => i.id === itemId);
                const itemName = item ? item.name : itemId;
                return `• **${itemName}** (\`${itemId}\`)：${quantity} 個`;
            });

        // 2. 設施與永久升級解析
        const upgradeLines = Object.entries(upgrades)
            .filter(([_, level]) => level > 0)
            .map(([itemId, level]) => {
                const item = shopItems.find(i => i.id === itemId);
                const itemName = item ? item.name : itemId;
                return `• **${itemName}** (\`${itemId}\`)：Lv.${level}`;
            });

        // 3. 防護罩狀態解析
        const isShieldActive = shieldExpiresAt > Date.now();
        const shieldStatus = isShieldActive
            ? `🛡️ **護罩生效中**（將於 <t:${Math.floor(shieldExpiresAt / 1000)}:R> 到期）`
            : '❌ **無活性護罩**';

        const fields = [
            {
                name: '🎒 持有道具',
                value: inventoryLines.length > 0 ? inventoryLines.join('\n') : '（目前沒有任何消耗性道具）',
                inline: false,
            },
        ];

        if (upgradeLines.length > 0) {
            fields.push({
                name: '⚡ 設施與永久升級',
                value: upgradeLines.join('\n'),
                inline: false,
            });
        }

        fields.push({
            name: '🛡️ 防護罩狀態',
            value: shieldStatus,
            inline: false,
        });

        const embed = createEmbed({
            title: `🎒 ${interaction.user.username} 的個人資產與背包`,
            fields: fields,
        }).setThumbnail(interaction.user.displayAvatarURL());

        logger.info(`[ECONOMY] Inventory retrieved`, {
            userId,
            guildId,
            itemCount: Object.keys(inventory).length,
            upgradeCount: Object.keys(upgrades).length,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};
