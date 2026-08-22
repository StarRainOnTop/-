import { getColor, getDefaultApplicationQuestions, botConfig } from '../../../config/bot.js';
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
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogChannel, resolveApplicationLogChannel, resolveLogChannel } from '../../../services/loggingService.js';

async function buildDashboardEmbed(settings, roles, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;
    const logChannel = applicationsChannel ? `<#${applicationsChannel}>` : '`未設定`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
            : '`未設定任何項目`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`未設定任何申請角色`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`未設定`';

    return new EmbedBuilder()
        .setTitle('申請儀表板')
        .setDescription(`管理 **${guild.name}** 的申請設定。\n請在下方選擇一個選項來修改設定。`)
        .setColor(getColor('info'))
        .addFields(
            { name: '申請狀態', value: settings.enabled ? '已啟用' : '已停用', inline: true },
            { name: '記錄頻道', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '管理員角色', value: managerRoleList, inline: false },
            { name: '問題', value: `${questionCount} 個已設定 — 第一個：${firstQ}`, inline: false },
            { name: '申請角色', value: roleList, inline: false },
            {
                name: '保留期限',
                value: `待審核：**${settings.pendingApplicationRetentionDays ?? 30}天** · 已審核：**${settings.reviewedApplicationRetentionDays ?? 14}天**`,
                inline: false,
            },
        )
        .setFooter({ text: '儀表板將在閒置 15 分鐘後關閉' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('選擇要設定的項目...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('記錄頻道')
                .setDescription('設定記錄新申請的頻道')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('管理員角色')
                .setDescription('新增或移除可管理申請的角色')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('編輯問題')
                .setDescription('自訂申請表單中顯示的問題')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('新增申請角色')
                .setDescription('新增會員可以申請的角色')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('移除申請角色')
                .setDescription('從申請列表中移除角色')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('保留期限')
                .setDescription('設定待審核與已審核申請的保留時間')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('申請系統')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(settings, roles, rootInteraction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;

            const isCompletelyUnconfigured = 
                !applicationsChannel && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    '申請系統尚未設定',
                    ErrorTypes.CONFIGURATION,
                    '申請系統尚未設定。請執行 `/app-admin setup` 來建立您的第一個申請。',
                );
            }

            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                
            }

            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `申請儀表板失敗：${error.message}`,
                ErrorTypes.UNKNOWN,
                '無法開啟申請儀表板。',
            );
        }
    },
};

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('選擇要設定的申請...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`設定 ${role.name} 申請`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('選擇申請')
        .setDescription('選擇您想要設定的申請角色。')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: '未做任何選擇。儀表板已關閉。',
            }).catch(() => {});
        }
    });
}

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [await buildDashboardEmbed(settings, roles, interaction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = resolveApplicationLogChannel(guildConfig, appSettings, settings);
    const isEnabled = selectedRole.enabled !== false; 

    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`繼承全域記錄頻道`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`繼承全域問題`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
        : '`未設定任何項目`';

    const embed = new EmbedBuilder()
        .setTitle('📋 申請儀表板')
        .setDescription(`**${selectedRole.name}** 的設定`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: '角色', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: '申請狀態', 
                value: isEnabled ? '✅ **已啟用**' : '❌ **已停用**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: '問題', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: '記錄頻道', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: '管理員角色',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: '保留期限',
                value: `待審核：**${settings.pendingApplicationRetentionDays ?? 30}天** · 已審核：**${settings.reviewedApplicationRetentionDays ?? 14}天**`,
                inline: false 
            },
        )
        .setFooter({ text: '儀表板將在閒置 10 分鐘後關閉' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? '停用申請' : '啟用申請')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('刪除申請')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`申請設定驗證錯誤：${error.message}`);
            } else {
                logger.error('未預期的申請儀表板錯誤：', error);
            }

            const errorMessage =
                error instanceof TitanBotError
                    ? error.userMessage || '處理您的選擇時發生錯誤。'
                    : '更新設定時發生未預期的錯誤。';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await replyUserError(selectInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage,
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 儀表板已逾時')
                .setDescription('此儀表板因長時間未互動而已關閉。請再次執行指令以繼續。')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                await saveApplicationSettings(interaction.client, guildId, settings);

                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 申請已停用' : '🟢 申請已啟用',
                        `申請系統現已**${wasEnabled ? '停用' : '啟用'}**。\n\n${
                            wasEnabled 
                                ? '會員將無法再申請角色。' 
                                : '會員現在可以開始申請角色。'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('切換全域申請狀態時發生錯誤：', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: '切換申請狀態時發生錯誤。',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('設定逾時')
                    .setDescription('此儀表板工作階段因長時間未互動（10 分鐘）而逾時。\n\n若要繼續設定您的申請，請再次執行指令。')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    if (selectedRoleId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? '此申請';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('確認刪除申請');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ 您即將永久刪除 **${appNameForDelete}**。此角色的所有儲存申請與設定都將被移除且無法復原。`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('我確認 — 此操作無法復原')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('顯示刪除確認互動視窗時發生錯誤：', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: '無法顯示確認互動視窗，請再試一次。',
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await replyUserError(btnInteraction, {
                        type: ErrorTypes.VALIDATION,
                        message: '申請刪除已取消。',
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await replyUserError(confirmSubmit, { type: ErrorTypes.VALIDATION, message: '您必須勾選確認方塊才能刪除申請。' });
                    return;
                }

                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('確認刪除申請時發生錯誤：', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: '刪除申請時發生錯誤。',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('設定逾時')
                    .setDescription('此儀表板工作階段因長時間未互動（10 分鐘）而逾時。\n\n若要繼續設定您的申請，請再次執行指令。')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await replyUserError(toggleInteraction, {
                        type: ErrorTypes.USER_INPUT,
                        message: '找不到申請角色。',
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                await saveApplicationRoles(interaction.client, guildId, roles);

                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 申請已停用' : '🟢 申請已啟用',
                        `**${updatedRole.name}** 申請現已**${wasEnabled ? '停用' : '啟用'}**。\n\n${
                            wasEnabled 
                                ? '此申請將不再顯示於 \`/apply submit\` 選項中。' 
                                : '此申請現在將顯示於 \`/apply submit\` 選項中。'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('切換申請狀態時發生錯誤：', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: '切換申請狀態時發生錯誤。',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('設定逾時')
                    .setDescription('此儀表板工作階段因長時間未互動（10 分鐘）而逾時。\n\n若要繼續設定您的申請，請再次執行指令。')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('選擇要設定的項目...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('記錄頻道')
                .setDescription('設定記錄申請的頻道')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('管理員角色')
                .setDescription('新增或移除可管理申請的角色')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('編輯問題')
                .setDescription('自訂申請表單中顯示的問題')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('保留期限')
                .setDescription('設定待審核與已審核申請的保留時間')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`)
        .setTitle('設定記錄頻道');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('選擇文字頻道...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('記錄頻道')
        .setDescription('將記錄新申請的頻道')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`,
        });

        const channelId = modalSubmission.fields.getField('log_channel').values[0];
        const channel = selectInteraction.guild.channels.cache.get(channelId);

        if (selectedRoleId) {
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            await setLogChannel(client, guildId, 'applications', channelId);
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('記錄頻道已更新', `申請記錄現在將傳送至 ${channel ?? `<#${channelId}>`}。\n您也可以從 \`/logging dashboard\` 管理此設定。`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('記錄頻道互動視窗發生錯誤：', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: '更新記錄頻道時發生錯誤。',
        });
    }
}

async function handleManagerRole(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('設定管理員角色');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('選擇要授予管理員權限的角色...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('管理員角色')
        .setDescription('選定的角色將切換為開/關管理員角色')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRoleIds = modalSubmission.fields.getField('manager_roles').values;
        const roleSet = new Set(settings.managerRoles ?? []);

        for (const roleId of selectedRoleIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        settings.managerRoles = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        const finalList = settings.managerRoles.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
            : '`無`';

        await modalSubmission.reply({
            embeds: [successEmbed('管理員角色已更新', `目前管理員角色：${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('管理員角色互動視窗發生錯誤：', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: '更新管理員角色時發生錯誤。',
        });
    }
}

async function handleQuestions(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('編輯申請問題')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('問題 1（必填）')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('問題 2（選填）')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('問題 3（選填）')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('問題 4（選填）')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('問題 5（選填）')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: '至少需要一個問題。' });
        return;
    }

    if (selectedRoleId) {
        
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ 問題已更新',
                `已儲存 ${newQuestions.length} 個問題。`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleRoleAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('新增申請角色');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('選擇會員可以申請的角色...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('申請角色')
        .setDescription('選擇會員將要申請的 Discord 角色')
        .setRoleSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('顯示名稱（留空則使用角色名稱）')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('application_role').values[0];
        const role = selectInteraction.guild.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await replyUserError(modalSubmission, { type: ErrorTypes.UNKNOWN, message: `${role ?? roleId} 已經是申請角色。` });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRoles(client, guildId, roles);
        await saveApplicationRoleSettings(client, guildId, roleId, {
            questions: getDefaultApplicationQuestions(),
        });

        await modalSubmission.reply({
            embeds: [successEmbed('已新增角色', `已將 ${role ?? roleId} 新增為 **${customName}**。`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('新增角色互動視窗發生錯誤：', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: '新增申請角色時發生錯誤。',
        });
    }
}

async function handleRoleRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    if (roles.length === 0) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: '沒有設定任何可移除的申請角色。',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('移除申請角色');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('選擇要移除的角色...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('移除申請角色')
        .setDescription('從申請列表中選擇要移除的角色')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('remove_role').values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await replyUserError(modalSubmission, { type: ErrorTypes.USER_INPUT, message: `<@&${roleId}> 不在申請角色列表中。` });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('已移除角色', `<@&${roleId}> 已從申請角色中移除。`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('移除角色互動視窗發生錯誤：', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: '移除申請角色時發生錯誤。',
        });
    }
}

async function handleRetention(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('申請保留期限');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**待審核** — 未回覆或處理中的申請在被自動移除前保留的時間。\n' +
            '**已審核** — 已批准或拒絕的申請保留的時間。\n' +
            '-# 請輸入介於 1 到 3650 之間的整數（最多 10 年）。',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('待審核保留天數')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('已審核保留天數')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '待審核保留天數必須是介於 **1** 到 **3650** 之間的整數。' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: '已審核保留天數必須是介於 **1** 到 **3650** 之間的整數。' });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ 保留期限已更新',
                `待審核申請將保留 **${pendingDays} 天**。\n已審核申請將保留 **${reviewedDays} 天**。`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await replyUserError(confirmSubmit, { type: ErrorTypes.USER_INPUT, message: '找不到申請角色。' });
            return;
        }

        const deletedRole = roles[roleIndex];

        roles.splice(roleIndex, 1);

        await saveApplicationRoles(client, guildId, roles);

        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ 申請已刪除',
                    `<@&${selectedRoleId}>（**${deletedRole.name}**）的申請已被永久刪除。\n\n` +
                    `已刪除：**${applicationsToDelete.length}** 個申請`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('handleDeleteApplication 發生錯誤：', error);
        await replyUserError(confirmSubmit, { type: ErrorTypes.UNKNOWN, message: '刪除申請時發生錯誤，請再試一次。' });
    }
}
