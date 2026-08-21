import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { formatDuration } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const INTEREST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 小時領一次利息
const INTEREST_RATE = 0.05; // 每日利息率 5%
const MAX_INTEREST_LIMIT = 10000; // 🛡️ 單次利息上限：$10,000

export default {
    data: new SlashCommandBuilder()
        .setName('interest')
        .setDescription('領取或查看銀行存款利息（5% 利息，上限 $10,000）')
        .addUserOption(option =>
            option
                .setName('player')
                .setDescription('查看指定玩家的利息與冷卻狀況（選填，不填則預設為自己）')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const targetUser = interaction.options.getUser('player') || interaction.user;
        const isSelf = targetUser.id === interaction.user.id;
        const now = Date.now();

        if (targetUser.bot) {
            throw createError(
                "Cannot check bot interest",
                ErrorTypes.VALIDATION,
                "機器人沒有經濟帳戶與銀行利息！",
                { targetId: targetUser.id }
            );
        }

        const targetData = await getEconomyData(client, interaction.guildId, targetUser.id);
        if (!targetData) {
            throw createError(
                "Target data not found",
                ErrorTypes.DATABASE,
                `找不到該玩家的經濟數據。`,
                { targetId: targetUser.id }
            );
        }

        targetData.wallet = targetData.wallet || 0;
        targetData.bank = targetData.bank || 0;
        targetData.lastInterest = targetData.lastInterest || 0;

        const lastInterest = targetData.lastInterest;
        const timePassed = now - lastInterest;
        const canClaim = timePassed >= INTEREST_COOLDOWN;
        const timeRemaining = canClaim ? 0 : (lastInterest + INTEREST_COOLDOWN - now);

        // 計算預估/可領取利息
        let interestAmount = Math.floor(targetData.bank * INTEREST_RATE);
        if (interestAmount > MAX_INTEREST_LIMIT) {
            interestAmount = MAX_INTEREST_LIMIT;
        }

        // 建立 Embed 顯示資訊
        const embed = infoEmbed(
            `📈 ${targetUser.username} 的銀行利息資訊`,
            `以下是該玩家目前的利息與存款概況：`
        )
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: "🏛️ 銀行存款", value: `$${targetData.bank.toLocaleString()}`, inline: true },
                { name: "💰 預估利息 (5%)", value: `$${interestAmount.toLocaleString()}`, inline: true },
                { name: "⏳ 領取狀態", value: canClaim ? "✅ **隨時可領取**" : `⏳ **冷卻中** (剩餘 ${formatDuration(timeRemaining)})`, inline: false }
            );

        // 如果是「查自己」，並且銀行有錢，我們就附上按鈕！
        let components = [];
        if (isSelf) {
            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_interest_${interaction.user.id}`)
                .setLabel(canClaim ? '🎁 立即領取利息' : '⏳ 冷卻中無法領取')
                .setStyle(canClaim ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(!canClaim || targetData.bank <= 0 || interestAmount <= 0);

            const row = new ActionRowBuilder().addComponents(claimButton);
            components = [row];
        }

        const responseMessage = await InteractionHelper.safeEditReply(interaction, { 
            embeds: [embed], 
            components: components 
        });

        // 如果不是查自己，或者沒有按鈕，就直接結束
        if (!isSelf || components.length === 0) return;

        // 建立按鈕點擊監聽器 (Collector)，讓玩家可以直接點擊領取
        const collectorFilter = i => i.user.id === interaction.user.id && i.customId === `claim_interest_${interaction.user.id}`;
        const collector = responseMessage.createMessageComponentCollector({ filter: collectorFilter, time: 60000 }); // 60 秒後按鈕失效

        collector.on('collect', async i => {
            try {
                await i.deferUpdate();
                const currentNow = Date.now();
                const freshData = await getEconomyData(client, interaction.guildId, interaction.user.id);
                
                freshData.bank = freshData.bank || 0;
                freshData.lastInterest = freshData.lastInterest || 0;

                // 再次驗證冷卻
                if (currentNow < freshData.lastInterest + INTEREST_COOLDOWN) {
                    return await i.followUp({ content: "❌ 您的利息還在冷卻中，無法領取！", ephemeral: true });
                }

                if (freshData.bank <= 0) {
                    return await i.followUp({ content: "❌ 你的銀行存款為 $0，無法領取利息！", ephemeral: true });
                }

                let earned = Math.floor(freshData.bank * INTEREST_RATE);
                if (earned > MAX_INTEREST_LIMIT) earned = MAX_INTEREST_LIMIT;

                freshData.bank += earned;
                freshData.lastInterest = currentNow;
                await setEconomyData(client, interaction.guildId, interaction.user.id, freshData);

                logger.info(`[ECONOMY] Interest claimed via button by ${interaction.user.id}`, { userId: interaction.user.id, earned });

                // 領取成功後更新原本的 Embed 與按鈕狀態
                const successUpdatedEmbed = successEmbed(
                    "📈 成功領取銀行利息！",
                    `您透過按鈕成功領取了存款利息共 **$${earned.toLocaleString()}**！\n*(註：每日利息上限為 $${MAX_INTEREST_LIMIT.toLocaleString()})*`
                ).addFields(
                    { name: "本次利息收入", value: `+$${earned.toLocaleString()}`, inline: true },
                    { name: "目前銀行總存款", value: `$${freshData.bank.toLocaleString()}`, inline: true }
                );

                const disabledButton = new ButtonBuilder()
                    .setCustomId('claimed_already')
                    .setLabel('✅ 今日已領取')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

                await interaction.editReply({ embeds: [successUpdatedEmbed], components: [disabledRow] });
                collector.stop();
            } catch (err) {
                logger.error(`Error handling interest button click: ${err.message}`);
            }
        });

        collector.on('end', async () => {
            // 時間到（60秒後）自動把按鈕停用，保持畫面乾淨
            try {
                const freshMsg = await interaction.fetchReply();
                if (freshMsg && freshMsg.components.length > 0) {
                    const oldRow = freshMsg.components[0];
                    if (oldRow && oldRow.components[0] && !oldRow.components[0].data.disabled) {
                        const expiredButton = ButtonBuilder.from(oldRow.components[0]).setDisabled(true).setLabel('⌛ 互動已逾時');
                        const expiredRow = new ActionRowBuilder().addComponents(expiredButton);
                        await interaction.editReply({ components: [expiredRow] }).catch(() => {});
                    }
                }
            } catch (e) {
                // 忽略過期錯誤
            }
        });

    }, { command: 'interest' })
};
