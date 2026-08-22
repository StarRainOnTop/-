import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    FileUploadBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getWelcomeConfig, saveWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

async function deferComponent(interaction) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }

    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        logger.debug('元件互動已過期或已被確認：', error.message);
        return false;
    }
}

async function sendEphemeralFollowUp(interaction, payload) {
    try {
        await interaction.followUp({
            ...payload,
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('發送私密後續訊息失敗：', error.message);
    }
}

function buildDashboardEmbed(cfg, guild) {
    const welcomeChannel = cfg.channelId ? `<#${cfg.channelId}>` : '`未設定`';
    const goodbyeChannel = cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`未設定`';

    const rawWelcome = cfg.welcomeMessage || '歡迎 {user} 來到 {server}！';
    const rawGoodbye = cfg.leaveMessage || '{user.tag} 已經離開了伺服器。';
    const welcomePreview = `\`${rawWelcome.length > 55 ? rawWelcome.substring(0, 55) + '…' : rawWelcome}\``;
    const goodbyePreview = `\`${rawGoodbye.length > 55 ? rawGoodbye.substring(0, 55) + '…' : rawGoodbye}\``;

    return new EmbedBuilder()
        .setTitle('👋 歡迎與歡送系統儀表板')
        .setDescription(
            `管理 **${guild.name}** 的歡迎與歡送設定。\n使用開關來啟用/停用各個功能，然後選擇選項進行編輯。`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: '歡迎頻道', value: welcomeChannel, inline: true },
            { name: '歡迎狀態', value: cfg.enabled ? '已啟用' : '已停用', inline: true },
            { name: '歡迎標註', value: cfg.welcomePing ? '開啟' : '關閉', inline: true },
            { name: '歡送頻道', value: goodbyeChannel, inline: true },
            { name: '歡送狀態', value: cfg.goodbyeEnabled ? '已啟用' : '已停用', inline: true },
            { name: '歡送標註', value: cfg.goodbyePing ? '開啟' : '關閉', inline: true },
            { name: '歡迎訊息', value: welcomePreview, inline: false },
            { name: '歡送訊息', value: goodbyePreview, inline: false },
        )
        .setFooter({ text: '儀表板會在閒置 10 分鐘後關閉' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`greet_cfg_${guildId}`)
        .setPlaceholder('選擇要設定的項目...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('歡迎頻道')
                .setDescription('設定發送歡迎訊息的頻道')
                .setValue('welcome_channel')
                .setEmoji('🟢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('歡迎訊息')
                .setDescription('編輯成員加入時顯示的文字')
                .setValue('welcome_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('歡迎圖片')
                .setDescription('設定歡迎訊息的圖片')
                .setValue('welcome_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('歡送頻道')
                .setDescription('設定發送歡送訊息的頻道')
                .setValue('goodbye_channel')
                .setEmoji('🔴'),
            new StringSelectMenuOptionBuilder()
                .setLabel('歡送訊息')
                .setDescription('編輯成員離開時顯示的文字')
                .setValue('goodbye_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('歡送圖片')
                .setDescription('設定歡送訊息的圖片')
                .setValue('goodbye_image')
                .setEmoji('🖼️'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const welcomeOn = cfg.enabled === true;
    const goodbyeOn = cfg.goodbyeEnabled === true;
    const welcomePingOn = cfg.welcomePing === true;
    const goodbyePingOn = cfg.goodbyePing === true;
    
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_welcome_${guildId}`)
                .setLabel('歡迎')
                .setStyle(welcomeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🟢')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_goodbye_${guildId}`)
                .setLabel('歡送')
                .setStyle(goodbyeOn ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji('🔴')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_welcome_${guildId}`)
                .setLabel('標註歡迎')
                .setStyle(welcomePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_goodbye_${guildId}`)
                .setLabel('標註歡送')
                .setStyle(goodbyePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
        ),
    ];
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    try {
        const selectMenu = buildSelectMenu(guildId);
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
            components: [
                ...buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
        });
    } catch (error) {
        logger.debug('無法重新整理歡迎儀表板（互動可能已過期）：', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getWelcomeConfig(client, guildId);

            if (!cfg.channelId && !cfg.goodbyeChannelId) {
                throw new TitanBotError(
                    'Greet system not configured',
                    ErrorTypes.CONFIGURATION,
                    '尚未設定歡迎或歡送系統。請先執行 `/welcome setup` 或 `/goodbye setup`。',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.deferred) {
                return;
            }

            const selectMenu = buildSelectMenu(guildId);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [
                    ...buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `greet_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'welcome_channel':
                            await handleWelcomeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_message':
                            await handleWelcomeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_image':
                            await handleWelcomeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_channel':
                            await handleGoodbyeChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_message':
                            await handleGoodbyeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_image':
                            await handleGoodbyeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`歡迎設定驗證錯誤：${error.message}`);
                    } else {
                        logger.error('未預期的歡迎儀表板錯誤：', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || '處理您的選擇時發生錯誤。'
                            : '更新設定時發生未預期的錯誤。';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `greet_cfg_toggle_welcome_${guildId}` ||
                        i.customId === `greet_cfg_toggle_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_ping_welcome_${guildId}` ||
                        i.customId === `greet_cfg_ping_goodbye_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (!await deferComponent(btnInteraction)) {
                        return;
                    }

                    const customId = btnInteraction.customId;

                    if (customId === `greet_cfg_toggle_welcome_${guildId}`) {
                        cfg.enabled = !cfg.enabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ 已更新歡迎設定',
                                    `歡迎訊息現在已 **${cfg.enabled ? '啟用' : '停用'}**。`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_toggle_goodbye_${guildId}`) {
                        cfg.goodbyeEnabled = !cfg.goodbyeEnabled;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ 已更新歡送設定',
                                    `歡送訊息現在已 **${cfg.goodbyeEnabled ? '啟用' : '停用'}**。`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_welcome_${guildId}`) {
                        cfg.welcomePing = !cfg.welcomePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ 已更新歡迎標註設定',
                                    `加入的使用者${cfg.welcomePing ? '' : ' **將不會**'}在歡迎訊息中被標註。`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_goodbye_${guildId}`) {
                        cfg.goodbyePing = !cfg.goodbyePing;
                        await saveWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                successEmbed(
                                    '✅ 已更新歡送標註設定',
                                    `離開的使用者${cfg.goodbyePing ? '' : ' **將不會**'}在歡送訊息中被標註。`,
                                ),
                            ],
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                } catch (error) {
                    logger.error('處理歡迎儀表板按鈕時發生錯誤：', error);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('儀表板已逾時')
                                    .setDescription('此儀表板因長時間未互動已關閉。請重新執行指令以繼續。')
                                    .setColor(getColor('error'))
                            ],
                            components: [],
                        });
                    } catch (error) {
                        logger.debug('逾時時無法更新儀表板：', error.message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('greet_dashboard 發生未預期的錯誤：', error);
            throw new TitanBotError(
                `Greet dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                '無法開啟歡迎儀表板。',
            );
        }
    },
};

async function handleWelcomeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_welcome_channel')
        .setPlaceholder('選擇文字頻道...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🟢 歡迎頻道')
                .setDescription(
                    `**目前：** ${cfg.channelId ? `<#${cfg.channelId}>` : '`未設定`'}\n\n請選擇要發送歡迎訊息的頻道。`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_welcome_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `我需要在 ${channel} 中擁有 **檢視頻道**、**傳送訊息** 與 **嵌入連結** 權限。`,
            });
            return;
        }

        cfg.channelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('頻道已更新', `歡迎訊息現在將會發送到 ${channel}。`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: '未選擇任何頻道。設定保持不變。',
            }).catch(() => {});
        }
    });
}

async function handleWelcomeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_message')
        .setTitle('編輯歡迎訊息')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('訊息（變數：{user}、{server} 等）')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.welcomeMessage || '歡迎 {user} 來到 {server}！')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.welcomeMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('歡迎訊息已更新', '歡迎訊息已成功儲存。')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_image')
        .setTitle('設定歡迎圖片');

    const imageHint = new TextDisplayBuilder()
        .setContent('請提供直接圖片網址**或**在下方上傳檔案。如果兩者皆提供，上傳的檔案將優先採用。若要移除圖片，請將網址留空並略過上傳。');

    const urlLabel = new LabelBuilder()
        .setLabel('圖片網址（選填）')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/welcome.png')
                .setStyle(TextInputStyle.Short)
                .setValue(cfg.welcomeImage || '')
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('或者上傳圖片檔案（選填）')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_welcome_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '圖片網址必須以 `http://` 或 `https://` 開頭。' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '請提供有效的圖片網址。' });
            return;
        }
    }

    cfg.welcomeImage = imageUrl || null;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('歡迎圖片已更新', `圖片已成功${imageUrl ? '更新' : '移除'}。`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.welcomePing = !cfg.welcomePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ 已更新歡迎標註設定',
                `加入的使用者${cfg.welcomePing ? '' : ' **將不會**'}在歡迎訊息中被標註。`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('greet_cfg_goodbye_channel')
        .setPlaceholder('選擇文字頻道...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🔴 歡送頻道')
                .setDescription(
                    `**目前：** ${cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : '`未設定`'}\n\n請選擇要發送歡送訊息的頻道。`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_goodbye_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `我需要在 ${channel} 中擁有 **檢視頻道**、**傳送訊息** 與 **嵌入連結** 權限。`,
            });
            return;
        }

        cfg.goodbyeChannelId = channel.id;
        await saveWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [successEmbed('頻道已更新', `歡送訊息現在將會發送到 ${channel}。`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: '未選擇任何頻道。設定保持不變。',
            }).catch(() => {});
        }
    });
}

async function handleGoodbyeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_message')
        .setTitle('編輯歡送訊息')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('訊息（變數：{user}、{server} 等）')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.leaveMessage || '{user.tag} 已經離開了伺服器。')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    cfg.leaveMessage = submitted.fields.getTextInputValue('message_input').trim();
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('歡送訊息已更新', '歡送訊息已成功儲存。')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_image')
        .setTitle('設定歡送圖片');

    const imageHint = new TextDisplayBuilder()
        .setContent('請提供直接圖片網址**或**在下方上傳檔案。如果兩者皆提供，上傳的檔案將優先採用。若要移除圖片，請將網址留空並略過上傳。');

    const urlLabel = new LabelBuilder()
        .setLabel('圖片網址（選填）')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/goodbye.png')
                .setStyle(TextInputStyle.Short)
                .setValue(
                    typeof cfg.leaveEmbed?.image === 'string'
                        ? cfg.leaveEmbed.image
                        : cfg.leaveEmbed?.image?.url || ''
                )
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('或者上傳圖片檔案（選填）')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const uploadedFiles = submitted.fields.getUploadedFiles('image_upload');
    let imageUrl = uploadedFiles?.at(0)?.url ?? submitted.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '圖片網址必須以 `http://` 或 `https://` 開頭。' });
                return;
            }
        } catch {
            await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '請提供有效的圖片網址。' });
            return;
        }
    }

    const nextLeaveEmbed = { ...(cfg.leaveEmbed || {}) };
    if (imageUrl) {
        nextLeaveEmbed.image = imageUrl;
    } else {
        delete nextLeaveEmbed.image;
    }

    cfg.leaveEmbed = nextLeaveEmbed;
    await saveWelcomeConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [successEmbed('歡送圖片已更新', `圖片已成功${imageUrl ? '更新' : '移除'}。`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.goodbyePing = !cfg.goodbyePing;
    await saveWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            successEmbed(
                '✅ 已更新歡送標註設定',
                `離開的使用者${cfg.goodbyePing ? '' : ' **將不會**'}在歡送訊息中被標註。`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
