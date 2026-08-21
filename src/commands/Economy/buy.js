import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { getItemById, validatePurchase } from '../../config/shop/items.js';
import { getCurrentPrice } from '../../config/shop/index.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('從商店購買物品')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('要購買的物品 ID')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('購買數量（預設：1）')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const itemId = interaction.options.getString("item_id").toLowerCase();
        const quantity = interaction.options.getInteger("quantity") || 1;

        const item = getItemById(itemId);

        if (!item) {
            throw createError(
                `Item ${itemId} not found`,
                ErrorTypes.VALIDATION,
                `商店中找不到 ID 為 \`${itemId}\` 的物品。`,
                { itemId }
            );
        }

        if (quantity < 1) {
            throw createError(
                "Invalid quantity",
                ErrorTypes.VALIDATION,
                "您必須購買 1 個或以上的數量。",
                { quantity }
            );
        }

        const userData = await getEconomyData(client, guildId, userId);

        // 確保資料庫結構完整
        userData.inventory = userData.inventory || {};
        userData.upgrades = userData.upgrades || {};

        // 1. 執行購買條件驗證 (檢查上限、重複購買等)
        const validation = validatePurchase(itemId, userData);
        if (!validation.valid) {
            throw createError(
                "Purchase validation failed",
                ErrorTypes.VALIDATION,
                validation.reason,
                { itemId, quantity }
            );
        }

        // 2. 計算動態折扣與升級費用
        const totalCost = getCurrentPrice(itemId, { quantity, userData });

        // 3. 檢查現金餘額
        if (userData.wallet < totalCost) {
            throw createError(
                "Insufficient funds",
                ErrorTypes.VALIDATION,
                `您需要 **$${totalCost.toLocaleString()}** 來購買 ${quantity} 個 **${item.name}**，但您的錢包裡只有 **$${userData.wallet.toLocaleString()}** 現金。`,
                { required: totalCost, current: userData.wallet, itemId, quantity }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

        // 身分組特別驗證
        if (item.type === "role" && itemId === "premium_role") {
            if (!PREMIUM_ROLE_ID) {
                throw createError(
                    "Premium role not configured",
                    ErrorTypes.CONFIGURATION,
                    "伺服器管理員尚未設定**高級商店身分組 (Premium Shop Role)**。",
                    { itemId }
                );
            }
            if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                throw createError(
                    "Role already owned",
                    ErrorTypes.VALIDATION,
                    `您已經擁有 **${item.name}** 身分組了。`,
                    { itemId, roleId: PREMIUM_ROLE_ID }
                );
            }
            if (quantity > 1) {
                throw createError(
                    "Invalid quantity for role",
                    ErrorTypes.VALIDATION,
                    `您只能購買 **${item.name}** 身分組一次。`,
                    { itemId, quantity }
                );
            }
        }

        // 扣除費用
        userData.wallet -= totalCost;

        let successDescription = `您已成功以 **$${totalCost.toLocaleString()}** 購買了 ${quantity} 個 **${item.name}**！`;

        // 根據商品類型處理發貨與生效邏輯
        if (item.type === "role" && itemId === "premium_role") {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

            if (!role) {
                throw createError(
                    "Role not found",
                    ErrorTypes.CONFIGURATION,
                    "此伺服器中已設定的高級身分組已不存在。",
                    { roleId: PREMIUM_ROLE_ID }
                );
            }

            try {
                await member.roles.add(role, `購買身分組：${item.name}`);
                successDescription += `\n\n**👑 身分組 ${role.toString()} 已經發放給您了！**`;
            } catch (roleError) {
                userData.wallet += totalCost; // 退款
                await setEconomyData(client, guildId, userId, userData);
                throw createError(
                    "Role assignment failed",
                    ErrorTypes.DISCORD_API,
                    "已成功扣款，但授予身分組失敗。您的金額已全數退還。",
                    { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                );
            }
        } else if (item.type === "upgrade") {
            // 累加升級等級
            userData.upgrades[itemId] = (userData.upgrades[itemId] || 0) + quantity;
            const currentLevel = userData.upgrades[itemId];
            successDescription += `\n\n**✨ 您的 ${item.name} 已提升至 Lv.${currentLevel}！**`;
        } else if (item.id === "personal_safe" || item.effect?.type === "robbery_protection") {
            // 處理 7 天防盜護罩時效
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            const durationMs = (item.effect?.durationDays || 7) * 24 * 60 * 60 * 1000 * quantity;
            const now = Date.now();
            const currentShield = (userData.shieldExpiresAt && userData.shieldExpiresAt > now) ? userData.shieldExpiresAt : now;
            
            userData.shieldExpiresAt = currentShield + durationMs;
            const expireDateStr = new Date(userData.shieldExpiresAt).toLocaleDateString('zh-TW');
            
            successDescription += `\n\n**🛡️ 防盜護罩已生效！保護期限至：${expireDateStr}**`;
        } else if (item.type === "consumable" || item.type === "tool") {
            userData.inventory[itemId] = (userData.inventory[itemId] || 0) + quantity;
            if (item.type === "tool") {
                successDescription += `\n\n**🛠️ ${item.name} 已新增至您的背包！**`;
            }
        }

        // 儲存更新後的玩家資料
        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            "💰 購買成功",
            successDescription,
        ).addFields({
            name: "新餘額",
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};
