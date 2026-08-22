import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

function createAutoroleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('管理新成員加入時自動分配的身分組')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('新增一個在新成員加入時自動分配的身分組')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('要新增的身分組')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('從自動分配中移除一個身分組')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('要移除的身分組')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('列出所有自動分配的身分組')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`自動身分組互動延遲 (defer) 失敗`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要**管理伺服器 (Manage Server)** 權限才能使用 `/autorole`。' });
        }

        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');

            // 已經移除原本會檢查並阻擋驗證系統 / AutoVerify 的限制程式碼
            
            if (role.position >= guild.members.me.roles.highest.position) {
                logger.warn(`[自動身分組] 用戶 ${interaction.user.tag} 嘗試在 ${guild.name} 新增高於或等於機器人最高身分組的 ${role.name} (${role.id})`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '我無法分配高於或等於我最高身分組的身分組。' });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                if (existingRoles.includes(role.id)) {
                    logger.info(`[自動身分組] 用戶 ${interaction.user.tag} 嘗試在 ${guild.name} 新增重複的身分組 ${role.name} (${role.id})`);
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `身分組 ${role} 已經設定為自動分配了。` });
                }

                // 限制最多設定 10 個自動身分組（可自行調整上限）
                if (existingRoles.length >= 10) {
                    return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: '你最多只能設定 10 個自動分配身分組。' });
                }

                const updatedRoles = [...existingRoles, role.id];

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[自動身分組] ${interaction.user.tag} 在 ${guild.name} 新增了自動身分組 ${role.name} (${role.id})`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ 已將 ${role} 新增至自動分配身分組。目前自動身分組總數：**${updatedRoles.length}**`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[自動身分組] 為伺服器 ${guild.id} 新增身分組失敗：`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '新增身分組時發生錯誤，請稍後再試。' });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = Array.isArray(config.roleIds) ? config.roleIds : [];
                
                if (!existingRoles.includes(role.id)) {
                    logger.info(`[自動身分組] 用戶 ${interaction.user.tag} 嘗試在 ${guild.name} 移除不存在的自動身分組 ${role.name} (${role.id})`);
                    return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `身分組 ${role} 並未設定為自動分配。` });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[自動身分組] ${interaction.user.tag} 在 ${guild.name} 從自動分配中移除了身分組 ${role.name} (${role.id})`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ 已從自動分配身分組中移除 ${role}。`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[自動身分組] 為伺服器 ${guild.id} 移除身分組失敗：`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '移除身分組時發生錯誤，請稍後再試。' });
            }
        } 
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const conflictSummary = [
                    verificationEnabled ? '驗證系統已啟用' : null,
                    autoVerifyEnabled ? 'AutoVerify 已啟用' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                if (autoRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ 目前沒有設定任何自動分配的身分組。${conflictSummary ? `\n\n⚠️ 提示（目前啟用的系統）：\n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];
                
                for (const roleId of autoRoles) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    logger.info(`[自動身分組] 正在從伺服器 ${interaction.guild.name} 清理 ${invalidRoleIds.length} 個失效的身分組`);
                    const updatedRoles = autoRoles.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ 找不到有效的自動身分組，所有失效的身分組已被清除。${conflictSummary ? `\n\n⚠️ 提示（目前啟用的系統）：\n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roleMentions = validRoles.map(r => `${r}`).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('自動分配身分組')
                    .setDescription(`${roleMentions}${conflictSummary ? `\n\n⚠️ 提示（目前啟用的系統）：\n${conflictSummary}` : ''}`)
                    .setFooter({ text: `已設定的自動身分組總數：${validRoles.length}` });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[自動身分組] 為伺服器 ${guild.id} 列出身分組失敗：`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '列出自動分配身分組時發生錯誤，請稍後再試。' });
            }
        }
    },
};
