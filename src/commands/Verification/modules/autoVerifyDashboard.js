import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
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
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;

function buildDashboardEmbed(cfg, guild, conflictSummary = '') {
    const autoVerify = cfg.verification?.autoVerify;
    const autoVerifyRole = autoVerify?.roleId ? guild.roles.cache.get(autoVerify.roleId) : null;
    
    let criteriaDescription = "`未設定`"[cite: 1];
    if (autoVerify?.criteria) {
        switch (autoVerify.criteria) {
            case "account_age":
                criteriaDescription = `\`帳號年資\` - \`${autoVerify.accountAgeDays} 天\``[cite: 1];
                break;
            case "none":
                criteriaDescription = `\`無條件\``[cite: 1];
                break;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🤖 自動驗證儀表板')[cite: 1]
        .setDescription(`管理 **${guild.name}** 的自動驗證設定。\n請從下方選擇選項以修改設定。`)[cite: 1]
        .setColor(getColor('info'))[cite: 1]
        .addFields(
            { name: '系統狀態', value: autoVerify?.enabled ? '已啟用' : '已停用', inline: true },[cite: 1]
            { name: '目標身分組', value: autoVerifyRole ? autoVerifyRole.toString() : '`未設定`', inline: true },[cite: 1]
            { name: '驗證條件', value: criteriaDescription, inline: true },[cite: 1]
            { name: '帳號年資', value: autoVerify?.accountAgeDays ? `\`${autoVerify.accountAgeDays}\` 天` : '`不適用`', inline: true },[cite: 1]
            { name: '\u200B', value: '\u200B', inline: true },[cite: 1]
            { name: '\u200B', value: '\u200B', inline: true },[cite: 1]
        );

    if (conflictSummary) {
        embed.addFields({ name: '設定衝突', value: conflictSummary, inline: false });[cite: 1]
    }

    return embed
        .setFooter({ text: '儀表板會在閒置 10 分鐘後關閉' })[cite: 1]
        .setTimestamp();[cite: 1]
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`autoverify_cfg_${guildId}`)[cite: 1]
        .setPlaceholder('請選擇要設定的項目...')[cite: 1]
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('變更身分組')[cite: 1]
                .setDescription('選擇要自動指派的身分組')[cite: 1]
                .setValue('role')[cite: 1]
                .setEmoji('🏷️'),[cite: 1]
            new StringSelectMenuOptionBuilder()
                .setLabel('編輯帳號年資天數')[cite: 1]
                .setDescription('設定最低帳號年資（天）')[cite: 1]
                .setValue('account_age')[cite: 1]
                .setEmoji('📅'),[cite: 1]
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const autoVerifyOn = cfg.verification?.autoVerify?.enabled === true;[cite: 1]
    return new ActionRowBuilder().addComponents([cite: 1]
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_criteria_${guildId}`)[cite: 1]
            .setLabel('變更條件')[cite: 1]
            .setStyle(ButtonStyle.Primary)[cite: 1]
            .setEmoji('🎯')[cite: 1]
            .setDisabled(disabled),[cite: 1]
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_toggle_${guildId}`)[cite: 1]
            .setLabel('自動驗證開關')[cite: 1]
            .setStyle(autoVerifyOn ? ButtonStyle.Success : ButtonStyle.Danger)[cite: 1]
            .setEmoji('🤖')[cite: 1]
            .setDisabled(disabled),[cite: 1]
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);[cite: 1]

        let conflictSummary = '';[cite: 1]
        try {
            const welcomeConfig = await getWelcomeConfig(client, guildId);[cite: 1]
            const verificationEnabled = Boolean(cfg.verification?.enabled);[cite: 1]
            const autoRoleConfigured = Boolean(cfg.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);[cite: 1]
            
            const conflicts = [
                verificationEnabled ? '驗證系統已啟用' : null,[cite: 1]
                autoRoleConfigured ? '自動身分組 (AutoRole) 已設定' : null[cite: 1]
            ].filter(Boolean);[cite: 1]
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');[cite: 1]
            }
        } catch (error) {
            logger.warn('Could not fetch autoverify dashboard conflicts:', error.message);[cite: 1]
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, conflictSummary)],[cite: 1]
            components: [
                buildButtonRow(cfg, guildId),[cite: 1]
                new ActionRowBuilder().addComponents(selectMenu),[cite: 1]
            ],
            flags: MessageFlags.Ephemeral,[cite: 1]
        });
    } catch (error) {
        logger.debug('Could not refresh autoverify dashboard (interaction may have expired):', error.message);[cite: 1]
    }
}

export default {
    prefixOnly: false,[cite: 1]
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;[cite: 1]
            const guildConfig = await getGuildConfig(client, guildId);[cite: 1]

            if (!guildConfig.verification?.autoVerify?.enabled) {
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);[cite: 1]
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);[cite: 1]
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);[cite: 1]
                
                const blockingMessage = [];[cite: 1]
                if (verificationEnabled) blockingMessage.push('驗證系統已啟用');[cite: 1]
                if (autoRoleConfigured) blockingMessage.push('自動身分組 (AutoRole) 已設定');[cite: 1]

                const blockingText = blockingMessage.length > 0 
                    ? `\n\n⚠️ **若要啟用自動驗證，你必須先停用以下項目：**\n${blockingMessage.map(msg => `• ${msg}`).join('\n')}`[cite: 1]
                    : '';[cite: 1]

                return await InteractionHelper.safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤖 自動驗證儀表板')[cite: 1]
                            .setDescription(`尚未設定自動驗證。${blockingText}\n\n請使用 \`/autoverify setup\` 進行設定。`)[cite: 1]
                            .setColor(getColor('warning'))[cite: 1]
                            .setFooter({ text: '儀表板會在閒置 10 分鐘後關閉' })[cite: 1]
                            .setTimestamp()[cite: 1]
                    ],
                    flags: MessageFlags.Ephemeral[cite: 1]
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });[cite: 1]

            const selectMenu = buildSelectMenu(guildId);[cite: 1]

            let conflictSummary = '';[cite: 1]
            try {
                const welcomeConfig = await getWelcomeConfig(client, guildId);[cite: 1]
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);[cite: 1]
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);[cite: 1]
                
                const conflicts = [
                    verificationEnabled ? '驗證系統已啟用' : null,[cite: 1]
                    autoRoleConfigured ? '自動身分組 (AutoRole) 已設定' : null[cite: 1]
                ].filter(Boolean);[cite: 1]
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');[cite: 1]
                }
            } catch (error) {
                logger.warn('Could not fetch autoverify dashboard conflicts:', error.message);[cite: 1]
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, conflictSummary)],[cite: 1]
                components: [
                    buildButtonRow(guildConfig, guildId),[cite: 1]
                    new ActionRowBuilder().addComponents(selectMenu),[cite: 1]
                ],
                flags: MessageFlags.Ephemeral,[cite: 1]
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,[cite: 1]
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `autoverify_cfg_${guildId}`,[cite: 1]
                time: 600_000,[cite: 1]
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];[cite: 1]
                try {
                    switch (selectedOption) {
                        case 'role':
                            await handleRole(selectInteraction, interaction, guildConfig, guildId, client);[cite: 1]
                            break;
                        case 'account_age':
                            await handleAccountAge(selectInteraction, interaction, guildConfig, guildId, client);[cite: 1]
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Autoverify config validation error: ${error.message}`);[cite: 1]
                    } else {
                        logger.error('Unexpected autoverify dashboard error:', error);[cite: 1]
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || '處理你的選項時發生錯誤。'[cite: 1]
                            : '更新設定時發生未預期的錯誤。'[cite: 1]

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});[cite: 1]
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,[cite: 1]
                        message: errorMessage,[cite: 1]
                    }).catch(() => {});[cite: 1]
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,[cite: 1]
                filter: i =>
                    i.user.id === interaction.user.id &&[cite: 1]
                    (i.customId === `autoverify_cfg_toggle_${guildId}` || i.customId === `autoverify_cfg_criteria_${guildId}`),[cite: 1]
                time: 600_000,[cite: 1]
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (btnInteraction.customId === `autoverify_cfg_criteria_${guildId}`) {
                        await handleCriteria(btnInteraction, interaction, guildConfig, guildId, client);[cite: 1]
                    } else if (btnInteraction.customId === `autoverify_cfg_toggle_${guildId}`) {
                        await btnInteraction.deferUpdate().catch(() => null);[cite: 1]
                        guildConfig.verification.autoVerify.enabled = !guildConfig.verification.autoVerify.enabled;[cite: 1]
                        await setGuildConfig(client, guildId, guildConfig);[cite: 1]
                        
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ 狀態已更新',[cite: 1]
                                    `自動驗證現已 **${guildConfig.verification.autoVerify.enabled ? '啟用' : '停用'}**。`,[cite: 1]
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,[cite: 1]
                        });

                        await refreshDashboard(interaction, guildConfig, guildId, client);[cite: 1]
                    }
                } catch (err) {
                    logger.debug('Button interaction error:', err.message);[cite: 1]
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();[cite: 1]
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setTitle('儀表板已逾時')[cite: 1]
                            .setDescription('此儀表板已因閒置而關閉。請重新執行指令以繼續。')[cite: 1]
                            .setColor(getColor('error'));[cite: 1]
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [timeoutEmbed],[cite: 1]
                            components: [],[cite: 1]
                            flags: MessageFlags.Ephemeral,[cite: 1]
                        });
                    } catch (error) {
                        logger.debug('Could not update dashboard on timeout:', error.message);[cite: 1]
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;[cite: 1]
            logger.error('Unexpected error in autoverify_dashboard:', error);[cite: 1]
            throw new TitanBotError(
                `Auto-verification dashboard failed: ${error.message}`,[cite: 1]
                ErrorTypes.UNKNOWN,[cite: 1]
                '無法開啟自動驗證儀表板。',[cite: 1]
            );
        }
    },
};

async function handleCriteria(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    
    if (!selectInteraction.deferred) {
        await selectInteraction.deferUpdate().catch(() => null);[cite: 1]
    }
    
    const criteriaEmbed = new EmbedBuilder()
        .setTitle('選擇驗證條件')[cite: 1]
        .setDescription('請選擇自動驗證的條件')[cite: 1]
        .setColor(getColor('info'));[cite: 1]

    const criteriaMenu = new StringSelectMenuBuilder()
        .setCustomId('autoverify_criteria_select')[cite: 1]
        .setPlaceholder('選擇條件...')[cite: 1]
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`帳號年資 (大於 ${defaultAccountAgeDays} 天)`)[cite: 1]
                .setDescription('擁有較老帳號的使用者將會被自動驗證')[cite: 1]
                .setValue('account_age'),[cite: 1]
            new StringSelectMenuOptionBuilder()
                .setLabel('無條件 (驗證所有人)')[cite: 1]
                .setDescription('所有使用者將立即獲得身分組')[cite: 1]
                .setValue('none'),[cite: 1]
        );

    await selectInteraction.followUp({
        embeds: [criteriaEmbed],[cite: 1]
        components: [new ActionRowBuilder().addComponents(criteriaMenu)],[cite: 1]
        flags: MessageFlags.Ephemeral,[cite: 1]
    });

    const criteriaCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,[cite: 1]
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_criteria_select',[cite: 1]
        time: 60_000,[cite: 1]
        max: 1,[cite: 1]
    });

    criteriaCollector.on('collect', async criteriaInteraction => {
        await criteriaInteraction.deferUpdate();[cite: 1]
        const newCriteria = criteriaInteraction.values[0];[cite: 1]

        guildConfig.verification.autoVerify.criteria = newCriteria;[cite: 1]

        if (newCriteria !== 'account_age') {
            guildConfig.verification.autoVerify.accountAgeDays = null;[cite: 1]
        } else if (!guildConfig.verification.autoVerify.accountAgeDays) {
            guildConfig.verification.autoVerify.accountAgeDays = defaultAccountAgeDays;[cite: 1]
        }

        await setGuildConfig(client, guildId, guildConfig);[cite: 1]

        let criteriaDisplay = '';[cite: 1]
        switch (newCriteria) {
            case 'account_age':
                criteriaDisplay = `帳號年資 (${guildConfig.verification.autoVerify.accountAgeDays} 天)`;[cite: 1]
                break;
            case 'none':
                criteriaDisplay = '無條件';[cite: 1]
                break;
        }

        await criteriaInteraction.followUp({
            embeds: [successEmbed('已更新條件', `自動驗證條件已變更為 **${criteriaDisplay}**。`)],[cite: 1]
            flags: MessageFlags.Ephemeral,[cite: 1]
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);[cite: 1]
    });

    criteriaCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,[cite: 1]
                message: '未選擇任何條件。設定未被更改。',[cite: 1]
            }).catch(() => {});[cite: 1]
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();[cite: 1]

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('autoverify_role_select')[cite: 1]
        .setPlaceholder('選擇一個身分組...')[cite: 1]
        .setMaxValues(1);[cite: 1]

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('自動驗證身分組')[cite: 1]
                .setDescription('選擇要指派給自動驗證使用者的身分組。')[cite: 1]
                .setColor(getColor('info')),[cite: 1]
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],[cite: 1]
        flags: MessageFlags.Ephemeral,[cite: 1]
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,[cite: 1]
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_role_select',[cite: 1]
        time: 60_000,[cite: 1]
        max: 1,[cite: 1]
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();[cite: 1]
        const role = roleInteraction.roles.first();[cite: 1]

        if (role.id === rootInteraction.guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,[cite: 1]
                message: '請選擇一個普通可指派的身分組 (不可選擇 @everyone 或由機器人管理的身份組)。',[cite: 1]
            });
            return;
        }

        const botMember = rootInteraction.guild.members.me;[cite: 1]
        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,[cite: 1]
                message: '所選的身分組必須低於我在伺服器身分組階層中的最高身分組。',[cite: 1]
            });
            return;
        }

        guildConfig.verification.autoVerify.roleId = role.id;[cite: 1]
        await setGuildConfig(client, guildId, guildConfig);[cite: 1]

        await roleInteraction.followUp({
            embeds: [successEmbed('已更新身分組', `自動驗證身分組已設定為 ${role}。`)],[cite: 1]
            flags: MessageFlags.Ephemeral,[cite: 1]
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);[cite: 1]
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,[cite: 1]
                message: '未選擇任何身分組。設定未被更改。',[cite: 1]
            }).catch(() => {});[cite: 1]
        }
    });
}

async function handleAccountAge(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('autoverify_account_age_modal')[cite: 1]
        .setTitle('設定帳號年資要求')[cite: 1]
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age_input')[cite: 1]
                    .setLabel('最低帳號年資 (天數)')[cite: 1]
                    .setStyle(TextInputStyle.Short)[cite: 1]
                    .setPlaceholder(`介於 ${minAccountAgeDays} 到 ${maxAccountAgeDays} 之間`)[cite: 1]
                    .setValue((guildConfig.verification.autoVerify.accountAgeDays || defaultAccountAgeDays).toString())[cite: 1]
                    .setRequired(true),[cite: 1]
            ),
        );

    await selectInteraction.showModal(modal);[cite: 1]

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'autoverify_account_age_modal' && i.user.id === selectInteraction.user.id,[cite: 1]
            time: 120_000,[cite: 1]
        })
        .catch(() => null);[cite: 1]

    if (!submitted) return;[cite: 1]

    const inputValue = submitted.fields.getTextInputValue('age_input').trim();[cite: 1]
    const days = parseInt(inputValue, 10);[cite: 1]

    if (isNaN(days) || days < minAccountAgeDays || days > maxAccountAgeDays) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: `請輸入一個介於 ${minAccountAgeDays} 到 ${maxAccountAgeDays} 之間的數字。` });[cite: 1]
        return;
    }

    guildConfig.verification.autoVerify.accountAgeDays = days;[cite: 1]
    await setGuildConfig(client, guildId, guildConfig);[cite: 1]

    await submitted.reply({
        embeds: [successEmbed('已更新帳號年資', `最低帳號年資要求已設定為 **${days} 天**。`)],[cite: 1]
        flags: MessageFlags.Ephemeral,[cite: 1]
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);[cite: 1]
}
