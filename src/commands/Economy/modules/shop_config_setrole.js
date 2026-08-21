import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        // 權限二次驗證
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError(
                'Permission denied',
                ErrorTypes.PERMISSION,
                '你需要 **管理伺服器 (Manage Server)** 權限才能設定高級身分組。'
            );
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        // 防止設定 @everyone 身分組
        if (role.id === guildId) {
            throw createError(
                'Invalid role selection',
                ErrorTypes.VALIDATION,
                '無法使用 `@everyone` 作為商店高級身分組。',
                { roleId: role.id }
            );
        }

        const currentConfig = (await getGuildConfig(client, guildId)) || {};
        currentConfig.premiumRoleId = role.id;
        
        await setGuildConfig(client, guildId, currentConfig);

        const embed = successEmbed(
            '已設定高級身分組',
            `**商店高級身分組**已成功設定為 ${role.toString()}。\n成員於商店購買高級身分組道具時將會被自動授予此身分組。`
        );

        if (interaction.deferred || interaction.replied) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
            });
        } else {
            await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: [MessageFlags.Ephemeral],
            });
        }
    },
};
