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
const DEFAULT_BANK_LIMIT = 500000; // 🏛️ 預設銀行容量上限（如果你的系統有專屬變數可以替換它）

export default {
    data: new SlashCommandBuilder()
        .setName('interest')
        .setDescription('領取或查看銀行存款利息（5% 利息，若銀行滿了自動改發至現金）')
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
        targetData.bankLimit = targetData.bankLimit || DEFAULT_BANK_LIMIT; // 取得銀行的容量上限
        targetData.lastInterest = targetData.lastInterest || 0;

        const lastInterest = targetData.lastInterest;
        const timePassed = now - lastInterest;
        const canClaim = timePassed >= INTEREST_COOLDOWN;
        const timeRemaining = canClaim ? 0 : (lastInterest + INTEREST_COOLDOWN - now);

        // 計算預估/可領取利息
        let rawInterest = targetData.bank * INTEREST_RATE;
        let isHitLimit = rawInterest > MAX_INTEREST_LIMIT;
        let interestAmount = isHitLimit ? MAX_INTEREST_LIMIT : Math.floor(rawInterest);

        // 建立 Embed 顯示資訊
        const embed = infoEmbed(
            `📈 ${targetUser.username} 的銀行利息資訊`,
            `以下是該玩家目前的利息與存款概況：`
        )
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: "🏛️ 銀行存款", value: `$${targetData.bank.toLocaleString()} / $${targetData.bankLimit.toLocaleString()}`, inline: true },
                { name: "💰 預估利息 (5%)", value: `$${interestAmount.toLocaleString()}${isHitLimit ? ' (已達單次上限)' : ''}`, inline: true },
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

        // 先發送/編輯回覆
        await InteractionHelper.safeEditReply(interaction, { 
            embeds: [embed], 
            components: components 
        });

        // 如果不是查自己，或者沒有按鈕，就直接結束
        if (!isSelf || components.length === 0) return;

        const responseMessage = await interaction.fetchReply();

        // 建立按鈕點擊監聽器 (Collector)
        const collectorFilter = i => i.user.id === interaction.user.id && i.customId === `claim_interest_${interaction.user.id}`;
        const collector = responseMessage.createMessageComponentCollector({ filter: collectorFilter, time: 60000 });

        collector.on('collect', async i => {
            try {
                await i.deferUpdate();
                const currentNow = Date.now();
                const freshData = await getEconomyData(client, interaction.guildId, interaction.user.id);
                
                freshData.wallet = freshData.wallet || 0;
                freshData.bank = freshData.bank || 0;
                freshData.bankLimit = freshData.bankLimit || DEFAULT_BANK_LIMIT;
                freshData.lastInterest = freshData.lastInterest || 0;

                // 再次驗證冷卻
                if (currentNow < freshData.lastInterest + INTEREST_COOLDOWN) {
                    return await i.followUp({ content: "❌ 您的利息還在冷卻中，無法領取！", ephemeral: true });
                }

                if (freshData.bank <= 0) {
                    return await i.followUp({ content: "❌ 你的銀行存款為 $0，無法領取利息！", ephemeral: true });
                }

                let earnedRaw = freshData.bank * INTEREST_RATE;
                let earned = earnedRaw > MAX_INTEREST_LIMIT ? MAX_INTEREST_LIMIT : Math.floor(earnedRaw);

                let addedToBank = 0;
                let addedToWallet = 0;

                // 💡 核心邏輯：檢查銀行加上利息後是否會超過上限
                if (freshData.bank >= freshData.bankLimit) {
                    // 如果原本銀行就已經滿了，全數發給現金
                    freshData.wallet += earned;
                    addedToWallet = earned;
                } else if (freshData.bank + earned > freshData.bankLimit) {
                    // 如果加了會超過上限，能塞多少進銀行就塞多少，剩下的給現金
                    addedToBank = freshData.bankLimit - freshData.bank;
                    addedToWallet = earned - addedToBank;

                    freshData.bank = freshData.bankLimit;
                    freshData.wallet += addedToWallet;
                } else {
                    // 銀行沒滿，全數加進銀行
                    freshData.bank += earned;
                    addedToBank = earned;
                }

                freshData.lastInterest = currentNow;
                await setEconomyData(client, interaction.guildId, interaction.user.id, freshData);

                logger.info(`[ECONOMY] Interest claimed by ${interaction.user.id} (Bank: +${addedToBank}, Wallet: +${addedToWallet})`, { userId: interaction.user.id, earned });

                // 組合動態的提示訊息
                let receiveDesc = `您透過按鈕成功領取了存款利息共 **$${earned.toLocaleString()}**！`;
                if (addedToWallet > 0 && addedToBank === 0) {
                    receiveDesc += `\n⚠️ **提示**：您的銀行已達容量上限，本次利息已全部改發至**錢包現金**！`;
                } else if (addedToWallet > 0) {
                    receiveDesc += `\n⚠️ **提示**：銀行空間不足，部分利息 ($${addedTo.toLocaleString()}) 已改發至**錢包現金**！`;
                }

                const successUpdatedEmbed = successEmbed(
                    "📈 成功領取銀行利息！",
                    receiveDesc
                ).addFields(
                    { name: "本次利息收入", value: `+$${earned.toLocaleString()}`, inline: true },
                    { name: "入帳明細", value: `銀行 +$${addedToBank.toLocaleString()}\n現金 +$${addedToWallet.toLocaleString()}`, inline: true },
                    { name: "目前資產狀態", value: `🏛️ 銀行: $${freshData.bank.toLocaleString()}\n💵 現金: $${freshData.wallet.toLocaleString()}`, inline: false }
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
