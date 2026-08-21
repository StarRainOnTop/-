import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('設定商店選項。（需要「管理伺服器」權限）')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('設定購買高級身分組商店道具時所授予的 Discord 身分組。')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('購買高級身分組時要授予的身分組。')
                        .setRequired(true)
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }

        throw createError(
            'Unknown subcommand',
            ErrorTypes.VALIDATION,
            `未知的子指令：\`${subcommand}\``,
            { subcommand }
        );
    }, { command: 'shop-config' })
};
