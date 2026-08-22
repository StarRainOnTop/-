import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

async function updateLivePanel(guild, cfg) {
    if (!cfg.channelId || !cfg.messageId) return;
    try {
        const channel = guild.channels.cache.get(cfg.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        const verifyEmbed = new EmbedBuilder()
            .setTitle('伺服器驗證')[cite: 2]
            .setDescription(cfg.message || botConfig.verification.defaultMessage)
            .setColor(getColor('success'));

        const verifyButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_user')
                .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
        );

        await msg.edit({ embeds: [verifyEmbed], components: [verifyButton] });
    } catch (error) {
        logger.warn('Could not update live verification panel:', error.message);
    }
}

function buildDashboardEmbed(cfg, guild, verifiedUserCount = 0, conflictSummary = '', panelStatus = null) {
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`未設定`';[cite: 2]
    const role = cfg.roleId ? `<@&${cfg.roleId}>` : '`未設定`';[cite: 2]
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelStatusValue = cfg.channelId ? formatPanelStatusField(panelStatus) : '`尚未設定`';[cite: 2]

    const embed = new EmbedBuilder()
        .setTitle('✅ 驗證系統儀表板')[cite: 2]
        .setDescription(`管理 **${guild.name}** 的驗證設定。\n請從下方選擇選項以修改設定。`)[cite: 2]
        .setColor(getColor('info'))[cite: 2]
        .addFields(
            { name: '面板狀態', value: panelStatusValue, inline: false },[cite: 2]
            { name: '驗證頻道', value: channel, inline: true },[cite: 2]
            { name: '已驗證身分組', value: role, inline: true },[cite: 2]
            { name: '系統狀態', value: cfg.enabled !== false ? '已啟用' : '已停用', inline: true },[cite: 2]
            { name: '按鈕文字', value: `\`${buttonText}\``, inline: true },[cite: 2]
            { name: '已驗證使用者', value: `${verifiedUserCount} 位使用者`, inline: true },[cite: 2]
            { name: '\u200B', value: '\u200B', inline: true },[cite: 2]
            { name: '驗證訊息', value: msgPreview, inline: false },[cite: 2]
        );

    if (conflictSummary) {
        embed.addFields({ name: '設定衝突', value: conflictSummary, inline: false });[cite: 2]
    }

    return embed
        .setFooter({ text: '儀表板會在閒置 10 分鐘後關閉' })[cite: 2]
        .setTimestamp();[cite: 2]
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)[cite: 2]
        .setPlaceholder('請選擇要設定的項目...')[cite: 2]
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('變更驗證頻道')[cite: 2]
                .setDescription('設定發送驗證面板的頻道')[cite: 2]
                .setValue('channel')[cite: 2]
                .setEmoji('📢'),[cite: 2]
            new StringSelectMenuOptionBuilder()
                .setLabel('變更已驗證身分組')[cite: 2]
                .setDescription('設定使用者驗證後獲得的身分組')[cite: 2]
                .setValue('role')[cite: 2]
                .setEmoji('🏷️'),[cite: 2]
            new StringSelectMenuOptionBuilder()
                .setLabel('編輯驗證訊息')[cite: 2]
                .setDescription('自訂驗證面板嵌入中顯示的訊息')[cite: 2]
                .setValue('message')[cite: 2]
                .setEmoji('💬'),[cite: 2]
            new StringSelectMenuOptionBuilder()
                .setLabel('編輯按鈕文字')[cite: 2]
                .setDescription('變更驗證按鈕上的標籤')[cite: 2]
                .setValue('button_text')[cite: 2]
                .setEmoji('🔘'),[cite: 2]
        );
}

function buildButtonRow(cfg, guildId, disabled = false, panelStatus = null) {
    const systemOn = cfg.enabled !== false;[cite: 2]
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';[cite: 2]

    const buttons = [];[cite: 2]

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)[cite: 2]
                .setLabel('重新發送面板')[cite: 2]
                .setStyle(ButtonStyle.Primary)[cite: 2]
                .setEmoji('📌')[cite: 2]
                .setDisabled(disabled),[cite: 2]
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)[cite: 2]
            .setLabel('驗證系統')[cite: 2]
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)[cite: 2]
            .setEmoji('🔒')[cite: 2]
            .setDisabled(disabled),[cite: 2]
    );

    return new ActionRowBuilder().addComponents(buttons);[cite: 2]
}

async function repostVerificationPanel(guild, cfg) {
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);[cite: 2]
    if (!channel) {
        throw new TitanBotError(
            'Panel channel missing',[cite: 2]
            ErrorTypes.CONFIGURATION,[cite: 2]
            '設定的驗證頻道已不存在。請從儀表板設定新頻道。',[cite: 2]
        );
    }

    const verifyEmbed = new EmbedBuilder()
        .setTitle('伺服器驗證')[cite: 2]
        .setDescription(cfg.message || botConfig.verification.defaultMessage)
        .setColor(getColor('success'));[cite: 2]

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_user')
            .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),[cite: 2]
    );

    return channel.send({ embeds: [verifyEmbed], components: [verifyButton] });[cite: 2]
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);[cite: 2]

        let verifiedUserCount = 0;[cite: 2]
        let conflictSummary = '';[cite: 2]
        let panelStatus = null;[cite: 2]

        if (cfg.channelId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild, cfg);[cite: 2]
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;[cite: 2]
                const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
                latestConfig.verification = cfg;[cite: 2]
                await setGuildConfig(client, guildId, latestConfig);[cite: 2]
            }
        }
        
        try {
            const verifiedRole = rootInteraction.guild.roles.cache.get(cfg.roleId);[cite: 2]
            if (verifiedRole) {
                verifiedUserCount = verifiedRole.members.size;[cite: 2]
            }
            
            const guildConfig = await getGuildConfig(client, guildId);[cite: 2]
            const welcomeConfig = await getWelcomeConfig(client, guildId);[cite: 2]
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);[cite: 2]
            const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);[cite: 2]
            
            const conflicts = [
                autoVerifyEnabled ? '自動驗證 (AutoVerify) 已啟用' : null,[cite: 2]
                autoRoleConfigured ? '自動身分組 (AutoRole) 已設定' : null[cite: 2]
            ].filter(Boolean);[cite: 2]
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');[cite: 2]
            }
        } catch (error) {
            logger.warn('Could not fetch verification dashboard details:', error.message);[cite: 2]
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, verifiedUserCount, conflictSummary, panelStatus)],[cite: 2]
            components: [
                buildButtonRow(cfg, guildId, false, panelStatus),[cite: 2]
                new ActionRowBuilder().addComponents(selectMenu),[cite: 2]
            ],
            flags: MessageFlags.Ephemeral,[cite: 2]
        });
    } catch (error) {
        logger.debug('Could not refresh verification dashboard (interaction may have expired):', error.message);[cite: 2]
    }
}

export default {
    prefixOnly: false,[cite: 2]
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;[cite: 2]
            const guildConfig = await getGuildConfig(client, guildId);[cite: 2]
            const cfg = guildConfig.verification;[cite: 2]

            if (!cfg?.channelId) {
                throw new TitanBotError(
                    'Verification not configured',[cite: 2]
                    ErrorTypes.CONFIGURATION,[cite: 2]
                    '驗證系統尚未設定。請先執行 `/verification setup`。',[cite: 2]
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });[cite: 2]

            let verifiedUserCount = 0;[cite: 2]
            let conflictSummary = '';[cite: 2]
            let panelStatus = null;[cite: 2]

            if (cfg.channelId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild, cfg);[cite: 2]
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;[cite: 2]
                    guildConfig.verification = cfg;[cite: 2]
                    await setGuildConfig(client, guildId, guildConfig);[cite: 2]
                }
            }
            
            try {
                const verifiedRole = interaction.guild.roles.cache.get(cfg.roleId);[cite: 2]
                if (verifiedRole) {
                    verifiedUserCount = verifiedRole.members.size;[cite: 2]
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);[cite: 2]
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);[cite: 2]
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);[cite: 2]
                
                const conflicts = [
                    autoVerifyEnabled ? '自動驗證 (AutoVerify) 已啟用' : null,[cite: 2]
                    autoRoleConfigured ? '自動身分組 (AutoRole) 已設定' : null[cite: 2]
                ].filter(Boolean);[cite: 2]
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');[cite: 2]
                }
            } catch (error) {
                logger.warn('Could not fetch verification dashboard details:', error.message);[cite: 2]
            }

            await startDashboardSession({
                interaction,[cite: 2]
                embeds: [buildDashboardEmbed(cfg, interaction.guild, verifiedUserCount, conflictSummary, panelStatus)],[cite: 2]
                components: [
                    buildButtonRow(cfg, guildId, false, panelStatus),[cite: 2]
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),[cite: 2]
                ],
                flags: MessageFlags.Ephemeral,[cite: 2]
                selectMenuId: `verif_cfg_${guildId}`,[cite: 2]
                buttonMatcher: (customId) =>
                    customId === `verif_cfg_toggle_${guildId}` || customId === `verif_cfg_repost_${guildId}`,[cite: 2]
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];[cite: 2]
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);[cite: 2]
                            break;
                        case 'role':
                            await handleRole(selectInteraction, interaction, cfg, guildId, client);[cite: 2]
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);[cite: 2]
                            break;
                        case 'button_text':
                            await handleButtonText(selectInteraction, interaction, cfg, guildId, client);[cite: 2]
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                        await btnInteraction.deferUpdate();[cite: 2]
                        const newMsg = await repostVerificationPanel(interaction.guild, cfg);[cite: 2]
                        cfg.messageId = newMsg.id;[cite: 2]
                        const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
                        latestConfig.verification = cfg;[cite: 2]
                        await setGuildConfig(client, guildId, latestConfig);[cite: 2]
                        await btnInteraction.followUp({
                            embeds: [successEmbed('已重新發送面板', `驗證面板已在 ${newMsg.channel} 恢復。`)],[cite: 2]
                            flags: MessageFlags.Ephemeral,[cite: 2]
                        });
                        await refreshDashboard(interaction, cfg, guildId, client);[cite: 2]
                        return;
                    }

                    await btnInteraction.deferUpdate().catch(() => null);[cite: 2]

                    const wasEnabled = cfg.enabled !== false;[cite: 2]
                    const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);[cite: 2]

                    if (!wasEnabled && autoVerifyEnabled) {
                        await replyUserError(btnInteraction, {
                            type: ErrorTypes.CONFIGURATION,[cite: 2]
                            message: '自動驗證 (AutoVerify) 目前已啟用。請先停用自動驗證，然後才能啟用手動驗證系統。\n\n請執行 `/autoverify` 前往自動驗證儀表板。',[cite: 2]
                        });
                        return;
                    }

                    cfg.enabled = !wasEnabled;[cite: 2]

                    if (!cfg.enabled && cfg.channelId && cfg.messageId) {
                        const channel = interaction.guild.channels.cache.get(cfg.channelId);[cite: 2]
                        if (channel) {
                            const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);[cite: 2]
                            if (msg) await msg.delete().catch(() => {});[cite: 2]
                        }
                    }

                    if (cfg.enabled && cfg.channelId) {
                        try {
                            const newMsg = await repostVerificationPanel(interaction.guild, cfg);[cite: 2]
                            cfg.messageId = newMsg.id;[cite: 2]
                        } catch (error) {
                            logger.warn('Could not re-post verification panel on re-enable:', error.message);[cite: 2]
                        }
                    }

                    const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
                    latestConfig.verification = cfg;[cite: 2]
                    await setGuildConfig(client, guildId, latestConfig);[cite: 2]

                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ 系統已更新',[cite: 2]
                                `驗證系統現已 **${cfg.enabled ? '啟用' : '停用'}**。`,[cite: 2]
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,[cite: 2]
                    });

                    await refreshDashboard(interaction, cfg, guildId, client);[cite: 2]
                },
                onTimeout: async (rootInteraction) => {
                    await InteractionHelper.safeEditReply(rootInteraction, {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('儀表板已逾時')[cite: 2]
                                .setDescription('此儀表板已因閒置而關閉。請重新執行指令以繼續。')[cite: 2]
                                .setColor(getColor('error')),[cite: 2]
                        ],
                        components: [],[cite: 2]
                        flags: MessageFlags.Ephemeral,[cite: 2]
                    });
                },
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;[cite: 2]
            logger.error('Unexpected error in verification_dashboard:', error);[cite: 2]
            throw new TitanBotError(
                `Verification dashboard failed: ${error.message}`,[cite: 2]
                ErrorTypes.UNKNOWN,[cite: 2]
                '無法開啟驗證儀表板。',[cite: 2]
            );
        }
    },
};

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();[cite: 2]

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('verif_cfg_channel')[cite: 2]
        .setPlaceholder('選擇一個文字頻道...')[cite: 2]
        .addChannelTypes(ChannelType.GuildText)[cite: 2]
        .setMaxValues(1);[cite: 2]

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('變更驗證頻道')[cite: 2]
                .setDescription(
                    `**目前：** ${cfg.channelId ? `<#${cfg.channelId}>` : '`未設定`'}\n\n選擇要發送驗證面板的頻道。\n\n> ⚠️ 現有的面板將會被刪除並重新發送到新頻道。`,[cite: 2]
                )
                .setColor(getColor('info')),[cite: 2]
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],[cite: 2]
        flags: MessageFlags.Ephemeral,[cite: 2]
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,[cite: 2]
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_channel',[cite: 2]
        time: 60_000,[cite: 2]
        max: 1,[cite: 2]
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();[cite: 2]
        const newChannel = chanInteraction.channels.first();[cite: 2]

        if (!botHasPermission(newChannel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,[cite: 2]
                message: `我需要在 ${newChannel} 中擁有 **檢視頻道**、**傳送訊息** 與 **嵌入連結** 權限。`,[cite: 2]
            });
            return;
        }

        if (cfg.channelId && cfg.messageId) {
            const oldChannel = rootInteraction.guild.channels.cache.get(cfg.channelId);[cite: 2]
            if (oldChannel) {
                try {
                    const oldMsg = await oldChannel.messages.fetch(cfg.messageId).catch(() => null);[cite: 2]
                    if (oldMsg) await oldMsg.delete();[cite: 2]
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const verifyEmbed = new EmbedBuilder()
                    .setTitle('伺服器驗證')[cite: 2]
                    .setDescription(cfg.message || botConfig.verification.defaultMessage)
                    .setColor(getColor('success'));[cite: 2]

                const verifyButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_user')
                        .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),[cite: 2]
                );

                const newMsg = await newChannel.send({ embeds: [verifyEmbed], components: [verifyButton] });[cite: 2]
                cfg.messageId = newMsg.id;[cite: 2]
            } catch (error) {
                logger.warn('Could not post verification panel in new channel:', error.message);[cite: 2]
            }
        }

        cfg.channelId = newChannel.id;[cite: 2]
        const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
        latestConfig.verification = cfg;[cite: 2]
        await setGuildConfig(client, guildId, latestConfig);[cite: 2]

        await chanInteraction.followUp({
            embeds: [successEmbed('已更新頻道', `驗證面板已移動至 ${newChannel}。`)],[cite: 2]
            flags: MessageFlags.Ephemeral,[cite: 2]
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);[cite: 2]
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,[cite: 2]
                message: '未選擇任何頻道。設定未被更改。',[cite: 2]
            }).catch(() => {});[cite: 2]
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();[cite: 2]

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('verif_cfg_role')[cite: 2]
        .setPlaceholder('選擇一個身分組...')[cite: 2]
        .setMaxValues(1);[cite: 2]

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('變更已驗證身分組')[cite: 2]
                .setDescription(
                    `**目前：** ${cfg.roleId ? `<@&${cfg.roleId}>` : '`未設定`'}\n\n選擇使用者驗證後要指派的身分組。`,[cite: 2]
                )
                .setColor(getColor('info')),[cite: 2]
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],[cite: 2]
        flags: MessageFlags.Ephemeral,[cite: 2]
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,[cite: 2]
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_role',[cite: 2]
        time: 60_000,[cite: 2]
        max: 1,[cite: 2]
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();[cite: 2]
        const role = roleInteraction.roles.first();[cite: 2]
        const guild = rootInteraction.guild;[cite: 2]
        const botMember = guild.members.me;[cite: 2]

        if (role.id === guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,[cite: 2]
                message: '請選擇一個普通可指派的身分組 (不可選擇 @everyone 或由機器人管理的身份組)。',[cite: 2]
            });
            return;
        }

        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,[cite: 2]
                message: '已驗證身分組必須低於我在伺服器身分組階層中的最高身分組。',[cite: 2]
            });
            return;
        }

        cfg.roleId = role.id;[cite: 2]
        const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
        latestConfig.verification = cfg;[cite: 2]
        await setGuildConfig(client, guildId, latestConfig);[cite: 2]

        await roleInteraction.followUp({
            embeds: [successEmbed('已更新身分組', `已驗證身分組已設定為 ${role}。`)],[cite: 2]
            flags: MessageFlags.Ephemeral,[cite: 2]
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);[cite: 2]
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,[cite: 2]
                message: '未選擇任何身分組。設定未被更改。',[cite: 2]
            }).catch(() => {});[cite: 2]
        }
    });
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_message')[cite: 2]
            .setTitle('編輯驗證訊息')[cite: 2]
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_input')[cite: 2]
                        .setLabel('驗證面板嵌入中顯示的訊息')[cite: 2]
                        .setStyle(TextInputStyle.Paragraph)[cite: 2]
                        .setValue(cfg.message || botConfig.verification.defaultMessage)[cite: 2]
                        .setMaxLength(2000)[cite: 2]
                        .setMinLength(1)[cite: 2]
                        .setRequired(true),[cite: 2]
                ),
            );

        await selectInteraction.showModal(modal);[cite: 2]

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_message' && i.user.id === selectInteraction.user.id,[cite: 2]
                time: 120_000,[cite: 2]
            })
            .catch(() => null);[cite: 2]

        if (!submitted) return;[cite: 2]

        cfg.message = submitted.fields.getTextInputValue('message_input').trim();[cite: 2]

        const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
        latestConfig.verification = cfg;[cite: 2]
        await setGuildConfig(client, guildId, latestConfig);[cite: 2]

        await updateLivePanel(rootInteraction.guild, cfg);[cite: 2]

        await submitted.reply({
            embeds: [successEmbed('已更新訊息', '驗證面板已更新為新訊息。')],[cite: 2]
            flags: MessageFlags.Ephemeral,[cite: 2]
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);[cite: 2]
    } catch (error) {
        logger.error('Error in handleMessage:', error);[cite: 2]
        
    }
}

async function handleButtonText(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_button_text')[cite: 2]
            .setTitle('編輯按鈕文字')[cite: 2]
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('button_text_input')[cite: 2]
                        .setLabel('按鈕標籤 (最多 80 個字元)')[cite: 2]
                        .setStyle(TextInputStyle.Short)[cite: 2]
                        .setValue(cfg.buttonText || botConfig.verification.defaultButtonText)[cite: 2]
                        .setMaxLength(80)[cite: 2]
                        .setMinLength(1)[cite: 2]
                        .setRequired(true),[cite: 2]
                ),
            );

        await selectInteraction.showModal(modal);[cite: 2]

        const submitted = await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'verif_cfg_button_text' && i.user.id === selectInteraction.user.id,[cite: 2]
                time: 120_000,[cite: 2]
            })
            .catch(() => null);[cite: 2]

        if (!submitted) return;[cite: 2]

        cfg.buttonText = submitted.fields.getTextInputValue('button_text_input').trim();[cite: 2]

        const latestConfig = await getGuildConfig(client, guildId);[cite: 2]
        latestConfig.verification = cfg;[cite: 2]
        await setGuildConfig(client, guildId, latestConfig);[cite: 2]

        await updateLivePanel(rootInteraction.guild, cfg);[cite: 2]

        await submitted.reply({
            embeds: [successEmbed('已更新按鈕文字', `驗證按鈕現在顯示為 **${cfg.buttonText}**。`)],[cite: 2]
            flags: MessageFlags.Ephemeral,[cite: 2]
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);[cite: 2]
    } catch (error) {
        logger.error('Error in handleButtonText:', error);[cite: 2]
        
    }
}
