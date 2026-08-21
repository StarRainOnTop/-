import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getCurrentPrice } from '../../../config/shop/index.js';
import { getEconomyData } from '../../../utils/economy.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // 取得玩家經濟數據以計算個人動態價格（如升級費用、特價折扣等）
            const userData = await getEconomyData(client, guildId, userId).catch(() => null);

            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                const embed = new EmbedBuilder()
                    .setTitle('🛒 商店')
                    .setColor(getColor('primary'))
                    .setDescription('使用 `/buy item_id:<道具代號> quantity:<數量>` 來購買道具。');

                pageItems.forEach(item => {
                    // 計算當前玩家顯示的價格與等級狀態
                    const price = getCurrentPrice(item.id, { quantity: 1, userData });
                    const currentLevel = userData?.upgrades?.[item.id];
                    const levelTag = currentLevel ? ` (目前等級: Lv.${currentLevel})` : '';

                    embed.addFields({
                        name: `${item.name} (${item.id})${levelTag}`,
                        value: `**類型：** ${item.type}\n**價格：** $${price.toLocaleString()}\n${item.description}`,
                        inline: false,
                    });
                });

                embed.setFooter({ text: `第 ${page}/${totalPages} 頁` });
                return embed;
            };

            const createShopComponents = (page) => {
                if (totalPages <= 1) return [];
                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ 上一頁')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('下一頁 ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages),
                    ),
                ];
            };

            const response = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: createShopComponents(currentPage),
                fetchReply: true,
            });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: '❌ 你無法使用這些按鈕。請自行輸入 `/shop` 來檢視商店。',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const { customId } = buttonInteraction;
                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();
                    if (customId === 'shop_prev' && currentPage > 1) currentPage--;
                    else if (customId === 'shop_next' && currentPage < totalPages) currentPage++;

                    await buttonInteraction.editReply({
                        embeds: [createShopEmbed(currentPage)],
                        components: createShopComponents(currentPage),
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledComponents = createShopComponents(currentPage);
                    disabledComponents.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
                    await interaction.editReply({ components: disabledComponents });
                } catch (error) {
                    logger.debug('shop_browse: could not disable components on collector end', {
                        error: error.message,
                    });
                }
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'shop_browse' });
        }
    },
};
